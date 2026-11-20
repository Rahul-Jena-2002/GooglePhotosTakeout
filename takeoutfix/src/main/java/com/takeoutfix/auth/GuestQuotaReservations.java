package com.takeoutfix.auth;

import java.util.IdentityHashMap;
import java.util.Map;

/** Tracks bytes reserved by guest files that have not finished yet. */
final class GuestQuotaReservations {
    enum Status { RESERVED, WAIT, LIMIT }
    record Attempt(Status status, Object token) {}

    private final long limit;
    private final Map<Object, Long> pending = new IdentityHashMap<>();
    private long reserved;

    GuestQuotaReservations(long limit) {
        if (limit < 0) throw new IllegalArgumentException("Quota must not be negative.");
        this.limit = limit;
    }

    synchronized Attempt tryReserve(long used, long bytes) {
        if (used < 0 || bytes < 0) throw new IllegalArgumentException("Usage must not be negative.");
        long remaining = Math.max(0, limit - Math.min(used, limit));
        if (bytes > remaining) return new Attempt(Status.LIMIT, null);
        if (bytes > remaining - reserved) return new Attempt(Status.WAIT, null);
        Object token = new Object();
        pending.put(token, bytes);
        reserved += bytes;
        return new Attempt(Status.RESERVED, token);
    }

    synchronized long release(Object token) {
        Long bytes = pending.remove(token);
        if (bytes == null) throw new IllegalStateException("Unknown or already released reservation.");
        reserved -= bytes;
        return bytes;
    }
}
