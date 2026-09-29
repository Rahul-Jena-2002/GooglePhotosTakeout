package com.takeoutfix.metasync;

import com.takeoutfix.metasync.core.FilePairingService;
import com.takeoutfix.metasync.model.PhotoPair;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.io.IOException;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class FilePairingServiceTest {

    private FilePairingService pairingService;

    @BeforeEach
    void setUp() {
        pairingService = new FilePairingService();
    }

    @Test
    void testExactBasenamePairing(@TempDir Path tempDir) throws IOException {
        File raw = new File(tempDir.toFile(), "IMG_2045.CR3");
        File jpg = new File(tempDir.toFile(), "IMG_2045.jpg");
        File xmp = new File(tempDir.toFile(), "IMG_2045.xmp");

        assertTrue(raw.createNewFile());
        assertTrue(jpg.createNewFile());
        assertTrue(xmp.createNewFile());

        List<PhotoPair> pairs = pairingService.pairFolders(tempDir.toFile(), tempDir.toFile());

        assertEquals(1, pairs.size());
        PhotoPair pair = pairs.get(0);
        assertEquals("img_2045", pair.getBaseName().toLowerCase());
        assertTrue(pair.isPaired());
        assertNotNull(pair.getSourceFile());
        assertNotNull(pair.getDestFile());
        assertNotNull(pair.getXmpSidecar());
    }

    @Test
    void testSuffixFuzzyPairing(@TempDir Path tempDir) throws IOException {
        File raw = new File(tempDir.toFile(), "DSC0123.ARW");
        File jpgEdited = new File(tempDir.toFile(), "DSC0123_edited.jpg");

        assertTrue(raw.createNewFile());
        assertTrue(jpgEdited.createNewFile());

        List<PhotoPair> pairs = pairingService.pairFolders(tempDir.toFile(), tempDir.toFile());

        assertEquals(1, pairs.size());
        PhotoPair pair = pairs.get(0);
        assertTrue(pair.isPaired());
        assertEquals("DSC0123.ARW", pair.getSourceFile().getName());
        assertEquals("DSC0123_edited.jpg", pair.getDestFile().getName());
    }

    @Test
    void testUnpairedFiles(@TempDir Path tempDir) throws IOException {
        File rawOnly = new File(tempDir.toFile(), "RAW_ONLY.NEF");
        File jpgOnly = new File(tempDir.toFile(), "EXPORT_ONLY.jpg");

        assertTrue(rawOnly.createNewFile());
        assertTrue(jpgOnly.createNewFile());

        List<PhotoPair> pairs = pairingService.pairFolders(tempDir.toFile(), tempDir.toFile());

        assertEquals(2, pairs.size());
        assertTrue(pairs.stream().anyMatch(p -> p.getSourceFile() != null && p.getDestFile() == null));
        assertTrue(pairs.stream().anyMatch(p -> p.getSourceFile() == null && p.getDestFile() != null));
    }
}
