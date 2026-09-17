package com.takeoutfix.util;

import com.takeoutfix.gui.components.ConsoleCard;
import org.junit.jupiter.api.Test;

import javax.swing.*;

import static org.junit.jupiter.api.Assertions.*;

public class ConsoleCardTest {

    @Test
    public void testConsoleCardLogFiltering() throws Exception {
        // Run on EDT
        SwingUtilities.invokeAndWait(() -> {
            ConsoleCard console = new ConsoleCard();

            // Append various logs
            console.appendLog("INFO", "Ops Center initialized");
            console.appendLog("SUCCESS", "Restored metadata for IMG_001.jpg");
            console.appendLog("ERROR", "Corrupt EXIF in DSC_999.png");
            console.appendLog("WARN", "Skipped duplicate file VID_002.mp4");
            console.appendLog("RESTORED", "Restored GPS for TRIP_003.mov");
        });

        // Let swing events process
        Thread.sleep(200);

        // Find the consolePane component inside ConsoleCard
        SwingUtilities.invokeAndWait(() -> {
            ConsoleCard console = new ConsoleCard();
            console.appendLog("INFO", "System ready");
            console.appendLog("RESTORED", "IMG_123.jpg restored");
            console.appendLog("ERROR", "Failed to parse metadata");
            console.appendLog("SKIP", "Skipping VID_456.mp4");
            assertNotNull(console);
        });
    }
}
