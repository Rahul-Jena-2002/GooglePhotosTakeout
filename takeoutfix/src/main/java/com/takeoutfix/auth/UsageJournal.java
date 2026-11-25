package com.takeoutfix.auth;

import org.json.JSONObject;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/** Durable, account-owned usage batches. A batch ID remains stable across retries. */
final class UsageJournal {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(UsageJournal.class);
    record Batch(UUID id, String uid, long files, long bytes) {}

    private final Path directory;

    UsageJournal(Path directory) { this.directory = directory; }

    synchronized Batch append(String uid, long files, long bytes) throws IOException {
        if (uid == null || uid.isBlank() || files < 0 || bytes < 0 || (files == 0 && bytes == 0)) {
            throw new IllegalArgumentException("Invalid usage batch");
        }
        Files.createDirectories(directory);
        Batch batch = new Batch(UUID.randomUUID(), uid, files, bytes);
        byte[] contents = new JSONObject().put("uid", uid).put("files", files).put("bytes", bytes)
                .toString().getBytes(StandardCharsets.UTF_8);
        Path temp = Files.createTempFile(directory, ".usage-", ".tmp");
        try {
            try (FileChannel channel = FileChannel.open(temp, StandardOpenOption.WRITE)) {
                ByteBuffer buffer = ByteBuffer.wrap(contents);
                while (buffer.hasRemaining()) channel.write(buffer);
                channel.force(true);
            }
            try {
                Files.move(temp, path(batch.id()), StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(temp, path(batch.id()));
            }
        } finally {
            Files.deleteIfExists(temp);
        }
        return batch;
    }

    synchronized List<Batch> pendingFor(String uid) throws IOException {
        if (uid == null || uid.isBlank() || !Files.exists(directory)) return List.of();
        List<Batch> result = new ArrayList<>();
        try (var entries = Files.list(directory)) {
            for (Path entry : entries.filter(p -> p.getFileName().toString().endsWith(".json")).sorted(Comparator.naturalOrder()).toList()) {
                try {
                    Batch batch = read(entry);
                    if (uid.equals(batch.uid())) result.add(batch);
                } catch (IOException e) {
                    log.warn("Keeping an unreadable usage batch for review: {}", entry.getFileName());
                }
            }
        }
        return result;
    }

    synchronized void acknowledge(Batch batch) throws IOException {
        Path entry = path(batch.id());
        if (!Files.exists(entry)) return;
        if (!read(entry).equals(batch)) throw new IOException("Usage batch changed before acknowledgement");
        Files.delete(entry);
    }

    private Path path(UUID id) { return directory.resolve(id + ".json"); }

    private Batch read(Path entry) throws IOException {
        try {
            String name = entry.getFileName().toString();
            UUID id = UUID.fromString(name.substring(0, name.length() - 5));
            JSONObject json = new JSONObject(Files.readString(entry));
            String uid = json.getString("uid");
            long files = json.getLong("files"), bytes = json.getLong("bytes");
            if (uid.isBlank() || files < 0 || bytes < 0 || (files == 0 && bytes == 0)) throw new IllegalArgumentException("Invalid values");
            return new Batch(id, uid, files, bytes);
        } catch (RuntimeException e) {
            throw new IOException("Invalid pending usage batch: " + entry.getFileName(), e);
        }
    }
}
