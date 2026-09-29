package com.photovault.core;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class HardwareAccelerationManagerTest {

    @Test
    @DisplayName("Hardware acceleration initializes and configures Prism properties safely")
    void testInitialization() {
        HardwareAccelerationManager.initialize();

        assertNotNull(System.getProperty("prism.order"));
        assertNotNull(System.getProperty("prism.vsync"));
        assertNotNull(System.getProperty("prism.lcdtext"));

        String summary = HardwareAccelerationManager.getAccelerationStatusSummary();
        assertNotNull(summary);
        assertFalse(summary.isBlank());
    }

    @Test
    @DisplayName("CPU SHA cryptographic acceleration detection reports boolean")
    void testShaAccelerationDetection() {
        boolean shaAcc = HardwareAccelerationManager.isShaHardwareAccelerated();
        // Modern 64-bit systems (x86_64, aarch64) support hardware intrinsics
        String arch = System.getProperty("os.arch", "").toLowerCase();
        if (arch.contains("64") || arch.contains("aarch")) {
            assertTrue(shaAcc);
        }
    }
}
