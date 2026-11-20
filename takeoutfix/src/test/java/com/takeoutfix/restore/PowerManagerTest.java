package com.takeoutfix.restore;

import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class PowerManagerTest {
    @Test
    void shutdownCommandsUseTheRequestedDelayWithoutRunningThem() {
        assertEquals(List.of("shutdown", "/s", "/t", "60"), PowerManager.shutdownCommand("Windows 11", 60));
        assertEquals(List.of("osascript", "-e", "delay 60", "-e", "tell app \"System Events\" to shut down"), PowerManager.shutdownCommand("Mac OS X", 60));
        assertEquals("osascript", PowerManager.shutdownCommand("Darwin", 60).get(0));
        assertEquals(List.of("shutdown", "-h", "+2"), PowerManager.shutdownCommand("Linux", 61));
        assertThrows(IllegalArgumentException.class, () -> PowerManager.shutdownCommand("Linux", -1));
        assertThrows(IllegalArgumentException.class, () -> PowerManager.shutdownCommand("Other OS", 60));
    }
}
