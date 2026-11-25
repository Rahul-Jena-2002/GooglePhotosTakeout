package com.takeoutfix.network;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

public class SystemHardwareInfoTest {

    @Test
    public void formatsAvailableMemoryModulesWithoutInventingMissingValues() {
        assertEquals("Samsung · 7467 MHz configured, Unknown manufacturer · 3200 MHz configured, Other",
                SystemHardwareInfo.formatMemoryModules(java.util.List.of(
                        "Samsung|7467", "Samsung|7467", "unknown|3200", "Other|0", "bad input", "|")));
        assertEquals("", SystemHardwareInfo.formatMemoryModules(java.util.List.of("unknown|0", "|")));
    }

    @Test
    public void testDirectPowershellProcess() throws Exception {
        // Brief pause for background detection
        Thread.sleep(800);

        int cores = SystemHardwareInfo.getPhysicalCores();
        int threads = SystemHardwareInfo.getLogicalProcessors();
        double totalRam = SystemHardwareInfo.getTotalMemoryGB();
        double usedRam = SystemHardwareInfo.getUsedMemoryGB();

        long processWsMb = SystemHardwareInfo.getProcessWorkingSetMB();
        assertNotNull(SystemHardwareInfo.getMemoryModuleSummary());

        System.out.println("SystemHardwareInfo: Cores=" + cores
                + ", Threads=" + threads
                + ", CPU=" + SystemHardwareInfo.getCpuName()
                + ", Process Working Set=" + processWsMb + " MB"
                + ", System RAM=" + String.format("%.2f GB / %.2f GB", usedRam, totalRam));

        assertTrue(cores == -1 || cores > 0, "Physical cores must be positive or unavailable");
        assertTrue(threads > 0, "Logical processors must be positive");
        assertTrue(totalRam > 0, "Total RAM must be > 0");
        assertTrue(processWsMb == -1 || processWsMb > 0, "Resident memory must be positive or unavailable");
    }
}
