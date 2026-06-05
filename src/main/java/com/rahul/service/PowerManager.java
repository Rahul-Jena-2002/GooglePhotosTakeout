package com.rahul.service;

import java.awt.Robot;
import java.awt.event.KeyEvent;
import org.springframework.stereotype.Service;

/**
 * Keeps the display awake by simulating minimal activity on an interval.
 * Also supports post-finish shutdown.
 */
@Service
public class PowerManager {

    public enum PostAction {
        KEEP_AWAKE_ONLY,
        KEEP_AWAKE_THEN_SHUTDOWN
    }

    private volatile boolean keepAwake = false;
    private Thread keeperThread;

    public void startKeepAwake() {
        if (keeperThread != null && keeperThread.isAlive()) {
            return;
        }

        keepAwake = true;
        keeperThread = new Thread(() -> {
            try {
                Robot robot = new Robot();
                while (keepAwake) {
                    // Light "nudge" to keep screen awake
                    robot.keyPress(KeyEvent.VK_SHIFT);
                    robot.keyRelease(KeyEvent.VK_SHIFT);
                    Thread.sleep(60_000); // every 60s
                }
            } catch (Exception ignored) {
                keepAwake = false;
            }
        }, "KeepAwakeThread");
        keeperThread.setDaemon(true);
        keeperThread.start();
    }

    public void stopKeepAwake() {
        keepAwake = false;
        if (keeperThread != null) {
            try {
                keeperThread.join(1000);
            } catch (InterruptedException ignored) {
            }
        }
    }

    public void runShutdownCommand(int delay) {
        String os = System.getProperty("os.name").toLowerCase();
        try {
            if (os.contains("win")) {
                new ProcessBuilder("shutdown", "/s", "/t", String.valueOf(delay)).start();
            } else if (os.contains("mac")) {
                new ProcessBuilder("osascript", "-e", "tell app \"System Events\" to shut down").start();
            } else {
                new ProcessBuilder("shutdown", "-h", "+" + (delay / 60.0)).start();
            }
        } catch (Exception ignored) {
        }
    }
}
