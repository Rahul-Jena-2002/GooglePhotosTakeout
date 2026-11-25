package com.takeoutfix.restore.infrastructure;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream;
import org.apache.commons.compress.compressors.gzip.GzipCompressorOutputStream;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.StringReader;
import java.io.PipedReader;
import java.io.PipedWriter;
import java.io.PipedInputStream;
import java.io.PipedOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.*;

class NativeExifToolEngineTest {
    @TempDir Path tempDir;

    @Test
    void bundledArchivesCreateDirectoriesAndRejectEscapingEntries() throws Exception {
        byte[] content = "test module".getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream tarBytes = new ByteArrayOutputStream();
        try (TarArchiveOutputStream tar = new TarArchiveOutputStream(new GzipCompressorOutputStream(tarBytes))) {
            tar.putArchiveEntry(new TarArchiveEntry("bundle/lib/"));
            tar.closeArchiveEntry();
            TarArchiveEntry file = new TarArchiveEntry("bundle/lib/module.pm");
            file.setSize(content.length);
            tar.putArchiveEntry(file);
            tar.write(content);
            tar.closeArchiveEntry();
        }
        Path unixRoot = tempDir.resolve("unix");
        NativeExifToolEngine.extractUnixArchive(new ByteArrayInputStream(tarBytes.toByteArray()), unixRoot);
        assertArrayEquals(content, Files.readAllBytes(unixRoot.resolve("lib/module.pm")));

        ByteArrayOutputStream unsafeTarBytes = new ByteArrayOutputStream();
        try (TarArchiveOutputStream tar = new TarArchiveOutputStream(new GzipCompressorOutputStream(unsafeTarBytes))) {
            TarArchiveEntry file = new TarArchiveEntry("bundle/lib/../../outside.txt");
            file.setSize(content.length);
            tar.putArchiveEntry(file);
            tar.write(content);
            tar.closeArchiveEntry();
        }
        assertThrows(IOException.class, () -> NativeExifToolEngine.extractUnixArchive(new ByteArrayInputStream(unsafeTarBytes.toByteArray()), unixRoot));
        assertFalse(Files.exists(tempDir.resolve("outside.txt")));

        ByteArrayOutputStream zipBytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(zipBytes)) {
            zip.putNextEntry(new ZipEntry("../outside.txt"));
            zip.write(content);
            zip.closeEntry();
        }
        assertThrows(IOException.class, () -> NativeExifToolEngine.extractWindowsArchive(new ByteArrayInputStream(zipBytes.toByteArray()), tempDir.resolve("windows")));
        assertFalse(Files.exists(tempDir.resolve("outside.txt")));
    }

    @Test
    void bundledArchivePathsStayInsideTheirDestination() throws Exception {
        Path root = Path.of(System.getProperty("java.io.tmpdir"), "takeoutfix-exiftool-test").toAbsolutePath().normalize();
        assertEquals(root.resolve("lib").resolve("module.pm"), NativeExifToolEngine.resolveBundledPath(root, "lib/module.pm"));
        assertThrows(IOException.class, () -> NativeExifToolEngine.resolveBundledPath(root, "../outside"));
        assertThrows(IOException.class, () -> NativeExifToolEngine.resolveBundledPath(root, "lib/../../outside"));
        assertThrows(IOException.class, () -> NativeExifToolEngine.resolveBundledPath(root, "lib\\..\\outside"));
        assertThrows(IOException.class, () -> NativeExifToolEngine.resolveBundledPath(root, root.getRoot().resolve("outside").toString()));
    }

    @Test
    void provisionPublishesOnlyCompleteArchivesAndReusesThem() throws Exception {
        byte[] content = "test binary".getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream validBytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(validBytes)) {
            zip.putNextEntry(new ZipEntry("exiftool.exe"));
            zip.write(content);
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("exiftool_files/module.txt"));
            zip.write(content);
            zip.closeEntry();
        }
        Path base = tempDir.resolve("bin");
        String fingerprint = NativeExifToolEngine.archiveFingerprint(new ByteArrayInputStream(validBytes.toByteArray()));
        Path installed = NativeExifToolEngine.provisionBundledArchive(base, true, fingerprint, new ByteArrayInputStream(validBytes.toByteArray()));
        assertArrayEquals(content, Files.readAllBytes(installed));
        assertEquals(fingerprint, Files.readString(installed.getParent().resolve(".ready")));
        assertEquals(installed, NativeExifToolEngine.provisionBundledArchive(base, true, fingerprint, new ByteArrayInputStream(new byte[0])));

        ByteArrayOutputStream invalidBytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(invalidBytes)) {
            zip.putNextEntry(new ZipEntry("exiftool.exe"));
            zip.write(content);
            zip.closeEntry();
        }
        String invalidFingerprint = NativeExifToolEngine.archiveFingerprint(new ByteArrayInputStream(invalidBytes.toByteArray()));
        assertThrows(IOException.class, () -> NativeExifToolEngine.provisionBundledArchive(base, true, invalidFingerprint, new ByteArrayInputStream(invalidBytes.toByteArray())));
        assertFalse(Files.exists(base.resolve("exiftool-win-" + invalidFingerprint.substring(0, 32))));
        try (var entries = Files.list(base)) {
            assertFalse(entries.anyMatch(path -> path.getFileName().toString().startsWith(".exiftool-staging-")));
        }
    }

    @Test
    void windowsArchiveWithTopLevelDirectoryExtractsExpectedFiles() throws Exception {
        byte[] content = "test binary".getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream archive = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(archive)) {
            zip.putNextEntry(new ZipEntry("exiftool-13.59_64/"));
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("exiftool-13.59_64/exiftool(-k).exe"));
            zip.write(content);
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("exiftool-13.59_64/exiftool_files/"));
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("exiftool-13.59_64/exiftool_files/module.txt"));
            zip.write(content);
            zip.closeEntry();
        }

        Path root = tempDir.resolve("nested-windows");
        NativeExifToolEngine.extractWindowsArchive(new ByteArrayInputStream(archive.toByteArray()), root);

        assertArrayEquals(content, Files.readAllBytes(root.resolve("exiftool.exe")));
        assertArrayEquals(content, Files.readAllBytes(root.resolve("exiftool_files/module.txt")));

        ByteArrayOutputStream unsafeArchive = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(unsafeArchive)) {
            zip.putNextEntry(new ZipEntry("bundle/"));
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("bundle/../../outside.txt"));
            zip.write(content);
            zip.closeEntry();
        }
        assertThrows(IOException.class, () -> NativeExifToolEngine.extractWindowsArchive(
                new ByteArrayInputStream(unsafeArchive.toByteArray()), root));
        assertFalse(Files.exists(tempDir.resolve("outside.txt")));
    }

    @Test
    void packagedArchiveForThisPlatformCanBeProvisioned() throws Exception {
        String os = System.getProperty("os.name", "").toLowerCase(java.util.Locale.ROOT);
        boolean windows = os.contains("win") && !os.contains("darwin");
        String resource = windows ? "/bin/exiftool_win.zip" : "/bin/exiftool_unix.tar.gz";
        String fingerprint;
        try (InputStream source = NativeExifToolEngine.class.getResourceAsStream(resource)) {
            assertNotNull(source, "The release must include its ExifTool archive.");
            fingerprint = NativeExifToolEngine.archiveFingerprint(source);
        }
        try (InputStream source = NativeExifToolEngine.class.getResourceAsStream(resource)) {
            assertNotNull(source);
            Path executable = NativeExifToolEngine.provisionBundledArchive(tempDir.resolve("packaged"), windows, fingerprint, source);
            assertTrue(Files.isRegularFile(executable));
            if (windows) {
                Process process = new ProcessBuilder(executable.toString(), "-ver").redirectErrorStream(true).start();
                try {
                    assertTrue(process.waitFor(20, java.util.concurrent.TimeUnit.SECONDS), "ExifTool did not start in time.");
                    assertEquals(0, process.exitValue(), "ExifTool could not report its version.");
                    assertFalse(new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8).isBlank());
                } finally {
                    if (process.isAlive()) process.destroyForcibly();
                }
            }
        }
    }

    @Test
    void timeoutStopsSilentProcessAndUnblocksResponse() throws Exception {
        PipedWriter pipe = new PipedWriter();
        BufferedReader reader = new BufferedReader(new PipedReader(pipe));
        AtomicBoolean stopped = new AtomicBoolean();
        Process silent = new Process() {
            @Override public OutputStream getOutputStream() { return OutputStream.nullOutputStream(); }
            @Override public InputStream getInputStream() { return InputStream.nullInputStream(); }
            @Override public InputStream getErrorStream() { return InputStream.nullInputStream(); }
            @Override public int waitFor() { return 0; }
            @Override public int exitValue() { return 0; }
            @Override public void destroy() {}
            @Override public Process destroyForcibly() {
                stopped.set(true);
                try { pipe.close(); } catch (java.io.IOException e) { throw new RuntimeException(e); }
                return this;
            }
        };
        assertTimeoutPreemptively(Duration.ofSeconds(2), () ->
                assertFalse(NativeExifToolEngine.readCommandStatusWithTimeout(reader, silent, 50)));
        assertTrue(stopped.get());
    }

    @Test
    void shutdownForcesAnUnresponsiveProcessWithoutWritingToItsPipe() {
        AtomicBoolean terminated = new AtomicBoolean();
        AtomicBoolean forced = new AtomicBoolean();
        Process stalled = new Process() {
            @Override public OutputStream getOutputStream() { throw new AssertionError("Shutdown must not write to the process"); }
            @Override public InputStream getInputStream() { return InputStream.nullInputStream(); }
            @Override public InputStream getErrorStream() { return InputStream.nullInputStream(); }
            @Override public int waitFor() { return 0; }
            @Override public boolean waitFor(long timeout, java.util.concurrent.TimeUnit unit) { return false; }
            @Override public int exitValue() { throw new IllegalThreadStateException(); }
            @Override public boolean isAlive() { return true; }
            @Override public void destroy() { terminated.set(true); }
            @Override public Process destroyForcibly() { forced.set(true); return this; }
        };
        NativeExifToolEngine.terminateProcess(stalled);
        assertTrue(terminated.get());
        assertTrue(forced.get());
    }

    @Test
    void outputReadTimeoutStopsAProcessThatNeverClosesItsOutput() throws Exception {
        PipedInputStream input = new PipedInputStream();
        PipedOutputStream pipe = new PipedOutputStream(input);
        AtomicBoolean stopped = new AtomicBoolean();
        Process silent = new Process() {
            @Override public OutputStream getOutputStream() { return OutputStream.nullOutputStream(); }
            @Override public InputStream getInputStream() { return input; }
            @Override public InputStream getErrorStream() { return InputStream.nullInputStream(); }
            @Override public int waitFor() { return 0; }
            @Override public boolean waitFor(long timeout, java.util.concurrent.TimeUnit unit) { return stopped.get(); }
            @Override public int exitValue() { return stopped.get() ? 1 : 0; }
            @Override public void destroy() { destroyForcibly(); }
            @Override public Process destroyForcibly() {
                stopped.set(true);
                try { pipe.close(); } catch (IOException e) { throw new RuntimeException(e); }
                return this;
            }
        };
        assertTimeoutPreemptively(Duration.ofSeconds(2), () ->
                assertTrue(NativeExifToolEngine.readProcessOutput(silent, 50).isEmpty()));
        assertTrue(stopped.get());
    }

    @Test
    void readyMarkerDoesNotHideFailedOrMissingStatus() throws Exception {
        long deadline = System.currentTimeMillis() + 10000;
        assertTrue(NativeExifToolEngine.readCommandStatus(new BufferedReader(new StringReader(
                "1 image files updated\nTAKEOUTFIX_STATUS=0\n{ready}\n")), deadline));
        assertFalse(NativeExifToolEngine.readCommandStatus(new BufferedReader(new StringReader(
                "Error: unsupported file\nTAKEOUTFIX_STATUS=1\n{ready}\n")), deadline));
        assertFalse(NativeExifToolEngine.readCommandStatus(new BufferedReader(new StringReader("{ready}\n")), deadline));
        assertFalse(NativeExifToolEngine.readCommandStatus(new BufferedReader(new StringReader("TAKEOUTFIX_STATUS=0\n")), deadline));
    }
}
