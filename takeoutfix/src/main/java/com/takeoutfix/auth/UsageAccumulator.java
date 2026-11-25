package com.takeoutfix.auth;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

/** Accumulates committed output until it is safely checkpointed. */
final class UsageAccumulator {
    private record Totals(long files, long bytes) {}
    private final UsageJournal journal;
    private final Map<String, Totals> pending = new LinkedHashMap<>();

    UsageAccumulator(UsageJournal journal) { this.journal = journal; }

    synchronized void add(String uid, long files, long bytes) {
        if (uid == null || uid.isBlank() || files <= 0 || bytes < 0) throw new IllegalArgumentException("Invalid usage");
        Totals previous = pending.getOrDefault(uid, new Totals(0, 0));
        pending.put(uid, new Totals(Math.addExact(previous.files(), files), Math.addExact(previous.bytes(), bytes)));
    }

    synchronized void checkpoint() throws IOException {
        var entries = pending.entrySet().iterator();
        while (entries.hasNext()) {
            var entry = entries.next();
            journal.append(entry.getKey(), entry.getValue().files(), entry.getValue().bytes());
            entries.remove();
        }
    }
}
