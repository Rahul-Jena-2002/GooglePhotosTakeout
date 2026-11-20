package com.takeoutfix.auth;

import org.junit.jupiter.api.Test;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

class GuestQuotaReservationsTest {
    @Test
    void pendingFilesReserveSpaceUntilTheyFinish() {
        var budget = new GuestQuotaReservations(100);
        var first = budget.tryReserve(10, 60);
        assertEquals(GuestQuotaReservations.Status.RESERVED, first.status());
        assertEquals(GuestQuotaReservations.Status.WAIT, budget.tryReserve(10, 40).status());
        assertEquals(GuestQuotaReservations.Status.LIMIT, budget.tryReserve(10, 91).status());
        assertEquals(60, budget.release(first.token()));
        assertEquals(GuestQuotaReservations.Status.RESERVED, budget.tryReserve(10, 40).status());
        assertThrows(IllegalStateException.class, () -> budget.release(first.token()));
    }

    @Test
    void completedBytesReduceTheNextFileAllowance() {
        var budget = new GuestQuotaReservations(100);
        var first = budget.tryReserve(0, 60);
        long completedBytes = budget.release(first.token());
        assertEquals(GuestQuotaReservations.Status.LIMIT, budget.tryReserve(completedBytes, 41).status());
        assertEquals(GuestQuotaReservations.Status.RESERVED, budget.tryReserve(completedBytes, 40).status());
    }

    @Test
    void concurrentFilesCannotReserveMoreThanTheRemainingAllowance() throws Exception {
        var budget = new GuestQuotaReservations(100);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> budget.tryReserve(0, 60));
            var second = pool.submit(() -> budget.tryReserve(0, 60));
            var a = first.get(2, TimeUnit.SECONDS);
            var b = second.get(2, TimeUnit.SECONDS);
            assertNotEquals(a.status(), b.status());
            assertTrue(a.status() == GuestQuotaReservations.Status.RESERVED || b.status() == GuestQuotaReservations.Status.RESERVED);
            assertTrue(a.status() == GuestQuotaReservations.Status.WAIT || b.status() == GuestQuotaReservations.Status.WAIT);
        }
    }
}
