package com.takeoutfix.network;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.*;

class NetworkMonitorServiceTest {

    @Test
    @DisplayName("NetworkMonitorService should accept listeners and dispatch initial status")
    void testListenerRegistration() {
        NetworkMonitorService netService = new NetworkMonitorService();
        AtomicBoolean dispatched = new AtomicBoolean(false);

        netService.addListener(online -> dispatched.set(true));

        assertTrue(dispatched.get(), "Expected initial status to be dispatched to new listener immediately");
    }

    @Test
    @DisplayName("checkNow should evaluate connection without throwing unhandled exceptions")
    void testCheckNowSafety() {
        NetworkMonitorService netService = new NetworkMonitorService();
        assertDoesNotThrow(netService::checkNow, "checkNow should be fault-tolerant");
    }
}
