package com.takeoutfix.restore.infrastructure;

import java.io.File;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;

/**
 * Pure Java in-memory / RandomAccessFile ISOBMFF (MP4/MOV/M4V) atom parser and timestamp injector.
 *
 * Injects QuickTime creation and modification timestamps into:
 *  - mvhd (Movie Header)
 *  - tkhd (Track Header)
 *  - mdhd (Media Header)
 *
 * QuickTime epoch begins 1904-01-01 00:00:00 UTC (2082844800 seconds prior to Unix epoch).
 * Allows Windows Explorer ("Media created"), Apple Photos, and media players to accurately read creation dates.
 */
public class Mp4AtomRestorer {

    public static final long QUICKTIME_EPOCH_OFFSET = 2082844800L;

    public static boolean injectCreationTime(File mp4File, long epochSec) {
        if (mp4File == null || !mp4File.exists() || mp4File.length() < 16) {
            return false;
        }

        long qtTimestamp = Math.max(0, epochSec + QUICKTIME_EPOCH_OFFSET);

        try (RandomAccessFile raf = new RandomAccessFile(mp4File, "rw");
             FileChannel channel = raf.getChannel()) {

            long fileSize = channel.size();
            long offset = 0;
            ByteBuffer headerBuf = ByteBuffer.allocate(16).order(ByteOrder.BIG_ENDIAN);

            while (offset + 8 <= fileSize) {
                headerBuf.clear();
                channel.position(offset);
                int read = channel.read(headerBuf);
                if (read < 8) break;
                headerBuf.flip();

                long boxSize = Integer.toUnsignedLong(headerBuf.getInt());
                byte[] typeBytes = new byte[4];
                headerBuf.get(typeBytes);
                String boxType = new String(typeBytes, StandardCharsets.US_ASCII);

                if (boxSize == 1) {
                    if (read < 16) break;
                    boxSize = headerBuf.getLong();
                    if (boxSize <= 0) break;
                } else if (boxSize == 0) {
                    boxSize = fileSize - offset;
                }

                if (boxSize < 8) break;

                if ("moov".equals(boxType)) {
                    processMoovBox(channel, offset + 8, offset + boxSize, qtTimestamp);
                    return true;
                }

                offset += boxSize;
            }
        } catch (Exception e) {
            System.err.println("Mp4AtomRestorer warning for " + mp4File.getName() + ": " + e.getMessage());
        }
        return false;
    }

    private static void processMoovBox(FileChannel channel, long start, long end, long qtTimestamp) throws Exception {
        long offset = start;
        ByteBuffer headerBuf = ByteBuffer.allocate(16).order(ByteOrder.BIG_ENDIAN);

        while (offset + 8 <= end) {
            headerBuf.clear();
            channel.position(offset);
            int read = channel.read(headerBuf);
            if (read < 8) break;
            headerBuf.flip();

            long boxSize = Integer.toUnsignedLong(headerBuf.getInt());
            byte[] typeBytes = new byte[4];
            headerBuf.get(typeBytes);
            String boxType = new String(typeBytes, StandardCharsets.US_ASCII);

            if (boxSize == 1) {
                if (read < 16) break;
                boxSize = headerBuf.getLong();
            } else if (boxSize == 0) {
                boxSize = end - offset;
            }

            if (boxSize < 8 || offset + boxSize > end) break;

            long contentStart = offset + 8;

            if ("mvhd".equals(boxType)) {
                updateHeaderBox(channel, contentStart, qtTimestamp);
            } else if ("trak".equals(boxType)) {
                processTrakBox(channel, contentStart, offset + boxSize, qtTimestamp);
            }

            offset += boxSize;
        }
    }

    private static void processTrakBox(FileChannel channel, long start, long end, long qtTimestamp) throws Exception {
        long offset = start;
        ByteBuffer headerBuf = ByteBuffer.allocate(16).order(ByteOrder.BIG_ENDIAN);

        while (offset + 8 <= end) {
            headerBuf.clear();
            channel.position(offset);
            int read = channel.read(headerBuf);
            if (read < 8) break;
            headerBuf.flip();

            long boxSize = Integer.toUnsignedLong(headerBuf.getInt());
            byte[] typeBytes = new byte[4];
            headerBuf.get(typeBytes);
            String boxType = new String(typeBytes, StandardCharsets.US_ASCII);

            if (boxSize == 1) {
                if (read < 16) break;
                boxSize = headerBuf.getLong();
            } else if (boxSize == 0) {
                boxSize = end - offset;
            }

            if (boxSize < 8 || offset + boxSize > end) break;

            long contentStart = offset + 8;

            if ("tkhd".equals(boxType)) {
                updateHeaderBox(channel, contentStart, qtTimestamp);
            } else if ("mdia".equals(boxType)) {
                processMdiaBox(channel, contentStart, offset + boxSize, qtTimestamp);
            }

            offset += boxSize;
        }
    }

    private static void processMdiaBox(FileChannel channel, long start, long end, long qtTimestamp) throws Exception {
        long offset = start;
        ByteBuffer headerBuf = ByteBuffer.allocate(16).order(ByteOrder.BIG_ENDIAN);

        while (offset + 8 <= end) {
            headerBuf.clear();
            channel.position(offset);
            int read = channel.read(headerBuf);
            if (read < 8) break;
            headerBuf.flip();

            long boxSize = Integer.toUnsignedLong(headerBuf.getInt());
            byte[] typeBytes = new byte[4];
            headerBuf.get(typeBytes);
            String boxType = new String(typeBytes, StandardCharsets.US_ASCII);

            if (boxSize == 1) {
                if (read < 16) break;
                boxSize = headerBuf.getLong();
            } else if (boxSize == 0) {
                boxSize = end - offset;
            }

            if (boxSize < 8 || offset + boxSize > end) break;

            long contentStart = offset + 8;

            if ("mdhd".equals(boxType)) {
                updateHeaderBox(channel, contentStart, qtTimestamp);
            }

            offset += boxSize;
        }
    }

    private static void updateHeaderBox(FileChannel channel, long contentStart, long qtTimestamp) throws Exception {
        ByteBuffer buf = ByteBuffer.allocate(24).order(ByteOrder.BIG_ENDIAN);
        channel.position(contentStart);
        int read = channel.read(buf);
        if (read < 12) return;
        buf.flip();

        int version = Byte.toUnsignedInt(buf.get());
        buf.position(4); // Skip 3 flags bytes

        if (version == 0) {
            // 32-bit creation and modification timestamps
            buf.clear();
            buf.putInt((int) (qtTimestamp & 0xFFFFFFFFL));
            buf.putInt((int) (qtTimestamp & 0xFFFFFFFFL));
            buf.flip();
            channel.position(contentStart + 4);
            channel.write(buf);
        } else if (version == 1) {
            // 64-bit creation and modification timestamps
            if (read < 20) return;
            buf.clear();
            buf.putLong(qtTimestamp);
            buf.putLong(qtTimestamp);
            buf.flip();
            channel.position(contentStart + 4);
            channel.write(buf);
        }
    }
}
