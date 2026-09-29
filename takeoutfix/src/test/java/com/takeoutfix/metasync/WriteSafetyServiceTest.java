package com.takeoutfix.metasync;

import com.takeoutfix.metasync.core.MetadataReader;
import com.takeoutfix.metasync.core.WriteSafetyService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.io.IOException;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class WriteSafetyServiceTest {

    private WriteSafetyService safetyService;

    @BeforeEach
    void setUp() {
        safetyService = new WriteSafetyService(new MetadataReader(null));
    }

    @Test
    void testDirectWriteToRawFilesIsBlocked(@TempDir Path tempDir) {
        String[] rawFiles = {"photo.CR3", "photo.NEF", "photo.ARW", "photo.DNG", "photo.RAF"};
        for (String rawName : rawFiles) {
            File raw = new File(tempDir.toFile(), rawName);
            assertThrows(SecurityException.class, () -> safetyService.validateTargetNotRaw(raw),
                    "Direct writes to " + rawName + " must throw SecurityException");
        }
    }

    @Test
    void testDirectWriteToJpegIsPermitted(@TempDir Path tempDir) {
        File jpeg = new File(tempDir.toFile(), "photo.jpg");
        assertDoesNotThrow(() -> safetyService.validateTargetNotRaw(jpeg));
    }

    @Test
    void testCreateBackupCreatesOriginalCopy(@TempDir Path tempDir) throws IOException {
        File jpeg = new File(tempDir.toFile(), "export.jpg");
        assertTrue(jpeg.createNewFile());

        File backup = safetyService.createBackup(jpeg);
        assertNotNull(backup);
        assertTrue(backup.exists());
        assertEquals("export.jpg.original", backup.getName());
    }
}
