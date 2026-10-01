package com.takeoutfix.culling;

import org.opencv.calib3d.Calib3d;
import org.opencv.core.*;
import org.opencv.features2d.BFMatcher;
import org.opencv.features2d.ORB;
import org.opencv.imgcodecs.Imgcodecs;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * Thin wrapper around OpenCV ORB+RANSAC feature matching used for burst-group verification.
 * Call {@link #isAvailable()} before any matching operation — the class degrades gracefully
 * when OpenCV native libs are absent.
 *
 * Algorithm:
 *  1. Load both images as grayscale.
 *  2. Detect ORB keypoints and compute binary descriptors (max 500 features).
 *  3. Brute-force match with Hamming distance.
 *  4. Keep matches with distance ≤ 1.5 × (global minimum match distance).
 *  5. Estimate homography with RANSAC (threshold 5 px).
 *  6. Accept as "same scene" when inlier ratio ≥ INLIER_RATIO and inlier count ≥ MIN_INLIERS.
 */
public final class OpenCvBridge {

    private static final int    ORB_FEATURES    = 500;
    private static final double MATCH_RATIO     = 1.5;
    private static final double RANSAC_THRESH   = 5.0;
    private static final double INLIER_RATIO    = 0.4;
    private static final int    MIN_INLIERS     = 15;

    private static volatile Boolean available = null;

    private OpenCvBridge() {}

    /**
     * Returns true when the OpenCV native library loaded successfully.
     * The result is cached after the first call.
     */
    public static boolean isAvailable() {
        if (available == null) {
            synchronized (OpenCvBridge.class) {
                if (available == null) {
                    try {
                        nu.pattern.OpenCV.loadLocally();
                        available = true;
                    } catch (Throwable t) {
                        System.err.println("[OpenCvBridge] Native library not available — ORB matching disabled: " + t.getMessage());
                        available = false;
                    }
                }
            }
        }
        return available;
    }

    /**
     * Returns true when ORB+RANSAC confirms that {@code a} and {@code b} depict the same scene.
     * Caller must check {@link #isAvailable()} first.
     *
     * @throws UnsupportedOperationException if OpenCV is not loaded
     */
    public static boolean verifyWithOrb(File a, File b) {
        if (!isAvailable()) throw new UnsupportedOperationException("OpenCV not available");

        Mat img1 = Imgcodecs.imread(a.getAbsolutePath(), Imgcodecs.IMREAD_GRAYSCALE);
        Mat img2 = Imgcodecs.imread(b.getAbsolutePath(), Imgcodecs.IMREAD_GRAYSCALE);
        if (img1.empty() || img2.empty()) {
            img1.release(); img2.release();
            return false;
        }

        ORB orb = ORB.create(ORB_FEATURES);
        MatOfKeyPoint kp1 = new MatOfKeyPoint(), kp2 = new MatOfKeyPoint();
        Mat des1 = new Mat(), des2 = new Mat();
        orb.detectAndCompute(img1, new Mat(), kp1, des1);
        orb.detectAndCompute(img2, new Mat(), kp2, des2);

        if (des1.empty() || des2.empty()) {
            releaseAll(img1, img2, des1, des2);
            return false;
        }

        BFMatcher matcher = BFMatcher.create(Core.NORM_HAMMING, false);
        MatOfDMatch matches = new MatOfDMatch();
        matcher.match(des1, des2, matches);

        DMatch[] matchArr = matches.toArray();
        if (matchArr.length < MIN_INLIERS) {
            releaseAll(img1, img2, des1, des2);
            return false;
        }

        // Find minimum match distance
        double minDist = Double.MAX_VALUE;
        for (DMatch m : matchArr) {
            if (m.distance < minDist) minDist = m.distance;
        }
        minDist = Math.max(minDist, 10.0); // guard against near-zero floor

        // Keep "good" matches
        List<DMatch> good = new ArrayList<>();
        for (DMatch m : matchArr) {
            if (m.distance <= MATCH_RATIO * minDist) good.add(m);
        }

        if (good.size() < MIN_INLIERS) {
            releaseAll(img1, img2, des1, des2);
            return false;
        }

        // Build point arrays for homography
        KeyPoint[] kp1Arr = kp1.toArray();
        KeyPoint[] kp2Arr = kp2.toArray();
        List<Point> pts1 = new ArrayList<>(), pts2 = new ArrayList<>();
        for (DMatch m : good) {
            pts1.add(kp1Arr[m.queryIdx].pt);
            pts2.add(kp2Arr[m.trainIdx].pt);
        }

        MatOfPoint2f src = new MatOfPoint2f(pts1.toArray(new Point[0]));
        MatOfPoint2f dst = new MatOfPoint2f(pts2.toArray(new Point[0]));
        Mat inlierMask = new Mat();

        Mat H = Calib3d.findHomography(src, dst, Calib3d.RANSAC, RANSAC_THRESH, inlierMask);

        int inlierCount = 0;
        if (H != null && !H.empty() && !inlierMask.empty()) {
            byte[] maskData = new byte[(int) inlierMask.total()];
            inlierMask.get(0, 0, maskData);
            for (byte val : maskData) {
                if (val != 0) inlierCount++;
            }
        }

        double ratio = (double) inlierCount / good.size();

        releaseAll(img1, img2, des1, des2, src, dst, inlierMask);
        if (H != null) H.release();

        return ratio >= INLIER_RATIO && inlierCount >= MIN_INLIERS;
    }

    private static void releaseAll(Mat... mats) {
        for (Mat m : mats) {
            try { if (m != null && !m.empty()) m.release(); } catch (Exception ignored) {}
        }
    }
}
