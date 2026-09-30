package com.takeoutfix.shared.history;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Durable Operation History Event Store.
 * Records task lifecycles, affected file counts, timestamps, and outcomes
 * into ~/.takeoutfix/logs/operations_history.json so user activity survives restarts.
 */
public class OperationHistoryService {

    private static final File DEFAULT_LOGS_DIR = new File(
            System.getProperty("user.home"), ".takeoutfix" + File.separator + "logs");
    private static final File DEFAULT_HISTORY_FILE = new File(DEFAULT_LOGS_DIR, "operations_history.json");

    private final File historyFile;

    public record OperationRecord(
            String id,
            String operationType,
            String status,
            Instant startedAt,
            Instant completedAt,
            long itemsProcessed,
            long bytesProcessed,
            String summary
    ) {}

    public OperationHistoryService() {
        this(DEFAULT_HISTORY_FILE);
    }

    public OperationHistoryService(File historyFile) {
        this.historyFile = historyFile != null ? historyFile : DEFAULT_HISTORY_FILE;
        ensureLogDir();
    }

    private void ensureLogDir() {
        File parent = historyFile.getParentFile();
        if (parent != null && !parent.exists()) {
            parent.mkdirs();
        }
    }

    /**
     * Records a completed or cancelled operation to the persistent history log.
     */
    public synchronized void recordOperation(String operationType,
                                            String status,
                                            Instant startedAt,
                                            Instant completedAt,
                                            long itemsProcessed,
                                            long bytesProcessed,
                                            String summary) {
        ensureLogDir();
        List<OperationRecord> records = loadRecords();

        OperationRecord newRecord = new OperationRecord(
                UUID.randomUUID().toString(),
                operationType,
                status,
                startedAt != null ? startedAt : Instant.now(),
                completedAt != null ? completedAt : Instant.now(),
                itemsProcessed,
                bytesProcessed,
                summary != null ? summary : ""
        );

        // Prepend new record (most recent first), retain up to 500 records
        records.add(0, newRecord);
        if (records.size() > 500) {
            records = records.subList(0, 500);
        }

        saveRecords(records);
    }

    /**
     * Loads all historical operation records.
     */
    public synchronized List<OperationRecord> loadRecords() {
        List<OperationRecord> list = new ArrayList<>();
        if (!historyFile.exists()) return list;

        try {
            String content = Files.readString(historyFile.toPath(), StandardCharsets.UTF_8);
            if (content.isBlank()) return list;

            JSONArray arr = new JSONArray(content);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.getJSONObject(i);
                list.add(new OperationRecord(
                        obj.optString("id", UUID.randomUUID().toString()),
                        obj.optString("operationType", "Unknown"),
                        obj.optString("status", "COMPLETED"),
                        Instant.ofEpochMilli(obj.optLong("startedAt", System.currentTimeMillis())),
                        Instant.ofEpochMilli(obj.optLong("completedAt", System.currentTimeMillis())),
                        obj.optLong("itemsProcessed", 0),
                        obj.optLong("bytesProcessed", 0),
                        obj.optString("summary", "")
                ));
            }
        } catch (Exception ignored) {
            // Corrupt or unreadable — return whatever could be parsed
        }
        return list;
    }

    private void saveRecords(List<OperationRecord> records) {
        try {
            JSONArray arr = new JSONArray();
            for (OperationRecord r : records) {
                JSONObject obj = new JSONObject();
                obj.put("id", r.id());
                obj.put("operationType", r.operationType());
                obj.put("status", r.status());
                obj.put("startedAt", r.startedAt().toEpochMilli());
                obj.put("completedAt", r.completedAt().toEpochMilli());
                obj.put("itemsProcessed", r.itemsProcessed());
                obj.put("bytesProcessed", r.bytesProcessed());
                obj.put("summary", r.summary());
                arr.put(obj);
            }
            Files.writeString(historyFile.toPath(), arr.toString(2), StandardCharsets.UTF_8);
        } catch (Exception ignored) {}
    }

    public File getHistoryFile() {
        return historyFile;
    }
}
