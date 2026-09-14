package com.rahul.util;

import com.rahul.gui.service.SystemHardwareInfo;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

public class SystemHardwareInfoTest {

    @Test
    public void testDirectPowershellProcess() throws Exception {
        // Brief pause for background detection
        Thread.sleep(800);

        int cores = SystemHardwareInfo.getPhysicalCores();
        int threads = SystemHardwareInfo.getLogicalProcessors();
        double totalRam = SystemHardwareInfo.getTotalMemoryGB();
        double usedRam = SystemHardwareInfo.getUsedMemoryGB();

        System.out.println("SystemHardwareInfo: Cores=" + cores
                + ", Threads=" + threads
                + ", CPU=" + SystemHardwareInfo.getCpuName()
                + ", RAM=" + String.format("%.2f GB / %.2f GB", usedRam, totalRam));

        assertTrue(cores > 0, "Physical cores must be > 0");
        assertTrue(threads >= cores, "Logical processors must be >= physical cores");
        assertTrue(totalRam > 0, "Total RAM must be > 0");
    }
}
