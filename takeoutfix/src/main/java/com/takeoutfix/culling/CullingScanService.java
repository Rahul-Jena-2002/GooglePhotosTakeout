package com.takeoutfix.culling;

import com.takeoutfix.dedup.analysis.PerceptualHashAnalyzer;
import com.takeoutfix.restore.infrastructure.NativeExifToolEngine;
import com.takeoutfix.shared.task.CancellationToken;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.*;
import java.util.stream.Stream;

/**
 * Core culling pipeline for AI Photo Picker.
 * 100% local — no network calls, no telemetry, images never leave the machine.
 *
 * <h3>Algorithm</h3>
 * <ol>
 *   <li>Walk directory for JPEG / PNG / WebP files.</li>
 *   <li>Read capture timestamp from EXIF {@code DateTimeOriginal} via ExifTool; fall back to mtime.</li>
 *   <li>Sort by timestamp, group into 20-second windows.</li>
 *   <li>Compute 64-bit dHash for each image IN PARALLEL (reuses {@link PerceptualHashAnalyzer}).</li>
 *   <li>Flag candidate pairs with Hamming distance ≤ {@value #DHASH_THRESHOLD}.</li>
 *   <li>Verify candidate pairs IN PARALLEL with ORB+RANSAC via {@link OpenCvBridge}
 *       (inlier ratio ≥ 0.4, count ≥ 15). Falls back to strict Hamming ≤ {@value #STRICT_DHASH_FALLBACK}
 *       when OpenCV is unavailable.</li>
 *   <li>Union-Find merges verified pairs into {@link BurstGroup}s; singletons are discarded.</li>
 * </ol>
 *
 * All hot loops respect {@link CancellationToken#checkPauseAndCancel()}.
 * ExifTool and the executor are optional — pass null to use mtime and ForkJoinPool.commonPool().
 */
public class CullingScanService {

    // ------------------------------------------------------------------
    // Tuning constants
    // ------------------------------------------------------------------

    /** Maximum time gap (seconds) between photos to belong to the same burst window. */
    public static final long TIME_WINDOW_SECS = 20L;

    /** dHash Hamming distance threshold when OpenCV ORB is available for verification. */
    public static final int DHASH_THRESHOLD = 10;

    /** Stricter dHash fallback threshold when OpenCV native libs are absent. */
    public static final int STRICT_DHASH_FALLBACK = 6;

    /** Extensions treated as still images (no video files — per spec). */
    private static final Set<String> SUPPORTED_EXTENSIONS =
            Set.of("jpg", "jpeg", "png", "webp");

    // Format used by ExifTool default DateTimeOriginal output (no -d flag)
    private static final ThreadLocal<SimpleDateFormat> EXIF_DATE_FMT =
            ThreadLocal.withInitial(() -> new SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.US));

    private final NativeExifToolEngine exifEngine; // nullable — falls back to mtime
    private final ExecutorService executor;        // nullable — falls back to ForkJoinPool.commonPool()

    public CullingScanService(NativeExifToolEngine exifEngine) {
        this(exifEngine, null);
    }

    /**
     * @param exifEngine ExifTool engine for EXIF timestamp reads; null falls back to mtime.
     * @param executor   Thread pool for parallel dHash and ORB work; null uses ForkJoinPool.commonPool().
     *                   Pass {@code ResourceManager.getCpuExecutor()} for TaskManager-aware scheduling.
     */
    public CullingScanService(NativeExifToolEngine exifEngine, ExecutorService executor) {
        this.exifEngine = exifEngine;
        this.executor = executor;
    }

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------

    /**
     * Scans {@code directory} and returns a list of burst groups (each with ≥ 2 photos).
     * The list is ordered by the timestamp of the earliest photo in each group.
     *
     * @throws IOException              if the directory cannot be walked
     * @throws IllegalArgumentException if path is not a directory
     */
    public List<BurstGroup> scan(Path directory, CancellationToken token) throws IOException {
        if (!Files.isDirectory(directory)) {
            throw new IllegalArgumentException("Not a directory: " + directory);
        }

        // 1. Collect media files
        List<File> mediaFiles = collectMediaFiles(directory, token);

        // 2. Read timestamps sequentially — ExifTool's own pool handles its internal concurrency
        List<PhotoEntry> photos = new ArrayList<>(mediaFiles.size());
        for (File f : mediaFiles) {
            if (token != null) token.checkPauseAndCancel();
            photos.add(new PhotoEntry(f, readTimestamp(f)));
        }

        // 3. Sort by timestamp ascending
        photos.sort(Comparator.comparingLong(PhotoEntry::getTimestampSecs));

        // 4. Compute dHash for each photo IN PARALLEL — embarrassingly parallel, no shared state
        computeHashesParallel(photos, token);

        // 5 + 6. Candidate pairs → dHash gate → parallel ORB verify → UnionFind
        UnionFind uf = buildGroupsParallel(photos, token);

        // 7. Build BurstGroup list — singletons excluded
        Map<Integer, List<Integer>> groupMap = uf.getGroups();
        List<BurstGroup> result = new ArrayList<>();
        for (List<Integer> members : groupMap.values()) {
            if (members.size() < 2) continue;
            List<PhotoEntry> groupPhotos = new ArrayList<>(members.size());
            for (int idx : members) {
                groupPhotos.add(photos.get(idx));
            }
            groupPhotos.sort(Comparator.comparingLong(PhotoEntry::getTimestampSecs));
            result.add(new BurstGroup(groupPhotos));
        }

        result.sort(Comparator.comparingLong(g -> g.getPhotos().get(0).getTimestampSecs()));
        return result;
    }

    // ------------------------------------------------------------------
    // Parallel dHash computation
    // ------------------------------------------------------------------

    /**
     * Decodes each image and sets its dHash pair in parallel.
     * Thread-safe: each PhotoEntry is written by exactly one submitted task.
     */
    private void computeHashesParallel(List<PhotoEntry> photos, CancellationToken token) {
        ExecutorService pool = executor != null ? executor : ForkJoinPool.commonPool();
        List<Future<?>> futures = new ArrayList<>(photos.size());

        for (PhotoEntry p : photos) {
            if (token != null && token.isCancelled()) break;
            futures.add(pool.submit(() -> {
                try {
                    BufferedImage img = ImageIO.read(p.getFile());
                    if (img != null) {
                        p.setDHashPair(new PerceptualHashAnalyzer.LongPair(
                                PerceptualHashAnalyzer.computePHash(img),
                                PerceptualHashAnalyzer.computeDHash(img)));
                    }
                } catch (IOException ignored) {
                    // dHashPair stays null; pair silently skipped in grouping
                }
            }));
        }

        for (Future<?> f : futures) {
            try {
                f.get();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            } catch (ExecutionException ignored) {}
        }
    }

    // ------------------------------------------------------------------
    // Parallel ORB / dHash pair verification
    // ------------------------------------------------------------------

    /**
     * Builds candidate pairs via time-window + dHash gate, verifies each pair in parallel
     * via ORB+RANSAC (or strict dHash fallback), and returns a populated UnionFind.
     */
    private UnionFind buildGroupsParallel(List<PhotoEntry> photos, CancellationToken token) {
        // Collect candidate pairs (fast sequential scan — list is already time-sorted)
        record Pair(int i, int j, int dDist) {}
        List<Pair> candidates = new ArrayList<>();

        for (int i = 0; i < photos.size(); i++) {
            if (token != null && token.isCancelled()) break;
            PhotoEntry pi = photos.get(i);
            if (pi.getDHashPair() == null) continue;

            for (int j = i + 1; j < photos.size(); j++) {
                PhotoEntry pj = photos.get(j);
                if (pj.getTimestampSecs() - pi.getTimestampSecs() > TIME_WINDOW_SECS) break;
                if (pj.getDHashPair() == null) continue;

                int dDist = hammingDistance(pi.getDHashPair().dHash, pj.getDHashPair().dHash);
                if (dDist <= DHASH_THRESHOLD) {
                    candidates.add(new Pair(i, j, dDist));
                }
            }
        }

        // Verify each candidate pair in parallel
        ExecutorService pool = executor != null ? executor : ForkJoinPool.commonPool();
        List<Future<Boolean>> futures = new ArrayList<>(candidates.size());

        for (Pair pair : candidates) {
            if (token != null && token.isCancelled()) break;
            int i = pair.i(), j = pair.j(), dDist = pair.dDist();

            futures.add(pool.submit(() -> {
                if (OpenCvBridge.isAvailable()) {
                    try {
                        return OpenCvBridge.verifyWithOrb(
                                photos.get(i).getFile(), photos.get(j).getFile());
                    } catch (Exception e) {
                        return dDist <= STRICT_DHASH_FALLBACK;
                    }
                }
                return dDist <= STRICT_DHASH_FALLBACK;
            }));
        }

        // Collect results and union verified pairs
        UnionFind uf = new UnionFind(photos.size());
        for (int k = 0; k < candidates.size(); k++) {
            if (token != null && token.isCancelled()) break;
            try {
                if (Boolean.TRUE.equals(futures.get(k).get())) {
                    uf.union(candidates.get(k).i(), candidates.get(k).j());
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            } catch (ExecutionException ignored) {}
        }

        return uf;
    }

    // ------------------------------------------------------------------
    // Internal helpers
    // ------------------------------------------------------------------

    private List<File> collectMediaFiles(Path dir, CancellationToken token) throws IOException {
        List<File> files = new ArrayList<>();
        try (Stream<Path> stream = Files.walk(dir)) {
            stream.filter(Files::isRegularFile)
                  .filter(CullingScanService::isSupportedImage)
                  .forEach(p -> {
                      if (token != null) token.checkPauseAndCancel();
                      File f = p.toFile();
                      if (f.length() > 0) files.add(f);
                  });
        }
        return files;
    }

    private static boolean isSupportedImage(Path path) {
        if (path == null || path.getFileName() == null) return false;
        String name = path.getFileName().toString().toLowerCase(Locale.ROOT);
        int dot = name.lastIndexOf('.');
        if (dot <= 0 || dot == name.length() - 1) return false;
        return SUPPORTED_EXTENSIONS.contains(name.substring(dot + 1));
    }

    /**
     * Reads capture timestamp in epoch-seconds.
     * Order: ExifTool DateTimeOriginal → CreateDate → file mtime.
     */
    private long readTimestamp(File file) {
        if (exifEngine != null) {
            for (String tag : new String[]{"-DateTimeOriginal", "-CreateDate"}) {
                List<String> out = exifEngine.executeWithOutput(
                        List.of("-s3", tag, file.getAbsolutePath()));
                if (!out.isEmpty()) {
                    String raw = out.get(0).trim();
                    if (!raw.isEmpty() && !raw.equalsIgnoreCase("0000:00:00 00:00:00")) {
                        try {
                            return EXIF_DATE_FMT.get().parse(raw).getTime() / 1000L;
                        } catch (ParseException ignored) {}
                    }
                }
            }
        }
        try {
            return Files.getLastModifiedTime(file.toPath()).toMillis() / 1000L;
        } catch (IOException e) {
            return 0L;
        }
    }

    /** Counts differing bits between two 64-bit hashes. */
    static int hammingDistance(long a, long b) {
        return Long.bitCount(a ^ b);
    }
}
