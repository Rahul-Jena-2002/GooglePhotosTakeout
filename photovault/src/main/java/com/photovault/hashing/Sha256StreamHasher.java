package com.photovault.hashing;

import com.photovault.core.FileStabilityGuard;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Objects;
import java.util.function.LongConsumer;

/**
 * High-throughput streaming SHA-256 digest calculator with strictly bounded memory footprint.
 * Features automatic hardware DMA zero-copy acceleration using direct ByteBuffers and
 * HotSpot SHA-NI CPU intrinsics, with transparent fallback to buffered streams.
 */
public class Sha256StreamHasher {

    public static final int BUFFER_SIZE = 128 * 1024; // 128 KB buffer

    public record HashResult(String hashHex, long bytesRead, boolean isStable) {}

    /**
     * Streams and digests a file into a SHA-256 hexadecimal string.
     * Automatically attempts hardware-accelerated DMA direct buffer streaming first.
     *
     * @param path the path to the file
     * @param byteProgressListener optional callback invoked periodically with newly read byte count
     * @return HashResult containing the hex digest and stability status
     * @throws IOException on read errors
     */
    public static HashResult hashFile(Path path, LongConsumer byteProgressListener) throws IOException {
        Objects.requireNonNull(path, "path cannot be null");

        FileStabilityGuard.FileSnapshot preSnapshot = FileStabilityGuard.capture(path);
        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 algorithm not available in runtime", e);
        }

        long totalBytesRead = 0;

        // 1. Hardware Accelerated DMA Path (NIO FileChannel + Direct ByteBuffer + CPU SHA-NI Intrinsics)
        try (FileChannel channel = FileChannel.open(path, StandardOpenOption.READ)) {
            ByteBuffer buffer = ByteBuffer.allocateDirect(BUFFER_SIZE);
            while (channel.read(buffer) != -1) {
                if (Thread.currentThread().isInterrupted()) {
                    throw new IOException("Hashing cancelled by user");
                }
                buffer.flip();
                int bytesRead = buffer.remaining();
                digest.update(buffer);
                totalBytesRead += bytesRead;
                buffer.clear();

                if (byteProgressListener != null) {
                    byteProgressListener.accept(bytesRead);
                }
            }
        } catch (IOException e) {
            if ("Hashing cancelled by user".equals(e.getMessage())) {
                throw e;
            }
            // 2. Safe Fallback to standard buffered stream (e.g. for virtual or non-channel filesystems)
            return hashFileStreamFallback(path, digest, preSnapshot, byteProgressListener);
        }

        boolean stable = FileStabilityGuard.isStable(path, preSnapshot);
        String hashHex = HexFormat.of().formatHex(digest.digest());

        return new HashResult(hashHex, totalBytesRead, stable);
    }

    private static HashResult hashFileStreamFallback(Path path, MessageDigest digest,
                                                     FileStabilityGuard.FileSnapshot preSnapshot,
                                                     LongConsumer byteProgressListener) throws IOException {
        digest.reset();
        byte[] buffer = new byte[BUFFER_SIZE];
        long totalBytesRead = 0;

        try (InputStream is = Files.newInputStream(path, StandardOpenOption.READ);
             BufferedInputStream bis = new BufferedInputStream(is, BUFFER_SIZE)) {

            int n;
            while ((n = bis.read(buffer)) != -1) {
                if (Thread.currentThread().isInterrupted()) {
                    throw new IOException("Hashing cancelled by user");
                }
                digest.update(buffer, 0, n);
                totalBytesRead += n;

                if (byteProgressListener != null) {
                    byteProgressListener.accept(n);
                }
            }
        }

        boolean stable = FileStabilityGuard.isStable(path, preSnapshot);
        String hashHex = HexFormat.of().formatHex(digest.digest());

        return new HashResult(hashHex, totalBytesRead, stable);
    }
}
