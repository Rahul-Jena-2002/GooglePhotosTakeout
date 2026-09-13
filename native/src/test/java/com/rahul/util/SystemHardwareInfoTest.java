package com.rahul.util;

import com.rahul.gui.service.SystemHardwareInfo;
import org.junit.jupiter.api.Test;

import java.io.BufferedReader;
import java.io.InputStreamReader;

import static org.junit.jupiter.api.Assertions.*;

public class SystemHardwareInfoTest {

    @Test
    public void testDirectPowershellProcess() throws Exception {
        // Wait up to 5 seconds for async detection to complete
        long start = System.currentTimeMillis();
        while (SystemHardwareInfo.getPhysicalCores() == SystemHardwareInfo.getLogicalProcessors() &&
                (System.currentTimeMillis() - start) < 5000) {
            Thread.sleep(100);
        }

        System.out.println("SystemHardwareInfo: Cores=" + SystemHardwareInfo.getPhysicalCores()
                + ", Threads=" + SystemHardwareInfo.getLogicalProcessors()
                + ", CPU=" + SystemHardwareInfo.getCpuName()
                + ", RAM=" + String.format("%.2f GB / %.2f GB", SystemHardwareInfo.getUsedMemoryGB(), SystemHardwareInfo.getTotalMemoryGB()));

        assertEquals(16, SystemHardwareInfo.getPhysicalCores());
        assertEquals(22, SystemHardwareInfo.getLogicalProcessors());
    }
}
