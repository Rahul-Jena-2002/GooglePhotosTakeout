package com.takeoutfix.restore.infrastructure;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.PrintWriter;
import java.io.Writer;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ExtractionLogTest {
    @Test
    void failedLogWritesWarnListenersOnce() throws Exception {
        ExtractionService service = new ExtractionService(null, null, null, null, null, null);
        List<String> warnings = new ArrayList<>();
        service.addRestorationListener(new ExtractionService.RestorationListener() {
            @Override public void onLog(String level, String message) {
                if ("WARN".equals(level)) warnings.add(message);
            }
            @Override public void onProgress(int processed, int total, long bytes, String action) {}
            @Override public void onStats(int scanned, int total, int restored, int unmatched, int errors) {}
        });
        Writer failing = new Writer() {
            @Override public void write(char[] chars, int offset, int length) throws IOException { throw new IOException("disk full"); }
            @Override public void flush() {}
            @Override public void close() {}
        };
        var writerField = ExtractionService.class.getDeclaredField("logWriter");
        writerField.setAccessible(true);
        writerField.set(service, new PrintWriter(failing));
        var sendLog = ExtractionService.class.getDeclaredMethod("sendLog", String.class, String.class);
        sendLog.setAccessible(true);

        sendLog.invoke(service, "INFO", "first");
        sendLog.invoke(service, "INFO", "second");
        assertEquals(1, warnings.size());
        assertTrue(warnings.get(0).contains("Could not save the restore log"));
    }
}
