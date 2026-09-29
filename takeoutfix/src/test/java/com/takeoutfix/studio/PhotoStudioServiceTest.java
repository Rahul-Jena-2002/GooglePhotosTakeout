package com.takeoutfix.studio;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("PhotoStudioService Unit Tests")
class PhotoStudioServiceTest {

    @Test
    @DisplayName("Should build comprehensive ExifTool arguments for JPEG photo")
    void testBuildArgsJpeg() {
        PhotoStudioService service = new PhotoStudioService(null);

        StudioEditRequest req = new StudioEditRequest();
        req.setDateMode(StudioEditRequest.DateMode.RELATIVE_SHIFT);
        req.setShiftHours(2);

        req.setUpdateLocation(true);
        req.setLatitude(35.6762);
        req.setLongitude(139.6503);

        req.setUpdatePresets(true);
        req.setArtist("Rahul Jena");
        req.setCopyright("© 2026 Rahul Jena");

        File file = new File("test_photo.jpg");
        LocalDateTime newDate = LocalDateTime.of(2024, 8, 12, 16, 0, 0);

        List<String> args = service.buildExifArgs(file, newDate, req);

        assertTrue(args.contains("-overwrite_original_in_place"));
        assertTrue(args.contains("-DateTimeOriginal=2024:08:12 16:00:00"));
        assertTrue(args.contains("-CreateDate=2024:08:12 16:00:00"));
        assertTrue(args.contains("-GPSLatitude=35.6762"));
        assertTrue(args.contains("-GPSLatitudeRef=N"));
        assertTrue(args.contains("-GPSLongitude=139.6503"));
        assertTrue(args.contains("-GPSLongitudeRef=E"));
        assertTrue(args.contains("-Artist=Rahul Jena"));
        assertTrue(args.contains("-Copyright=© 2026 Rahul Jena"));
    }

    @Test
    @DisplayName("Should build QuickTime atom arguments for MP4 video")
    void testBuildArgsMp4() {
        PhotoStudioService service = new PhotoStudioService(null);

        StudioEditRequest req = new StudioEditRequest();
        req.setDateMode(StudioEditRequest.DateMode.RELATIVE_SHIFT);

        File video = new File("clip.mp4");
        LocalDateTime newDate = LocalDateTime.of(2023, 1, 1, 12, 0, 0);

        List<String> args = service.buildExifArgs(video, newDate, req);

        assertTrue(args.contains("-CreateDate=2023:01:01 12:00:00"));
        assertTrue(args.contains("-TrackCreateDate=2023:01:01 12:00:00"));
        assertTrue(args.contains("-MediaCreateDate=2023:01:01 12:00:00"));
        assertFalse(args.contains("-DateTimeOriginal=2023:01:01 12:00:00")); // QuickTime uses CreateDate
    }

    @Test
    @DisplayName("Should format strip GPS argument correctly")
    void testStripGps() {
        PhotoStudioService service = new PhotoStudioService(null);

        StudioEditRequest req = new StudioEditRequest();
        req.setDateMode(StudioEditRequest.DateMode.NONE);
        req.setStripGps(true);

        File file = new File("private_photo.jpg");
        List<String> args = service.buildExifArgs(file, null, req);

        assertTrue(args.contains("-gps:all="));
        assertFalse(args.stream().anyMatch(a -> a.startsWith("-GPSLatitude")));
    }
}
