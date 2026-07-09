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
    private Process nativeKeepAwakeProcess;

    public synchronized void startKeepAwake() {
        if (keepAwake) {
            return;
        }
        keepAwake = true;

        String os = System.getProperty("os.name").toLowerCase();
        if (os.contains("win")) {
            // Windows: Robot is silent and does not trigger security prompts
            startWindowsRobotKeeper();
        } else if (os.contains("mac")) {
            // macOS: Use native caffeinate command
            startNativeKeeper("caffeinate", "-d");
        } else {
            // Linux/Unix: Use systemd-inhibit (completely silent and portal-free)
            startNativeKeeper("systemd-inhibit", "--what=idle", "--who=TakeoutFix", "--why=Restoring Metadata", "sleep", "86400");
        }
    }

    private void startWindowsRobotKeeper() {
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

    private void startNativeKeeper(String... command) {
        try {
            nativeKeepAwakeProcess = new ProcessBuilder(command).start();
        } catch (Exception e) {
            System.err.println("Failed to start native power keeper: " + e.getMessage());
            keepAwake = false;
        }
    }

    public synchronized void stopKeepAwake() {
        keepAwake = false;
        if (keeperThread != null) {
            try {
                keeperThread.join(500);
            } catch (InterruptedException ignored) {
            }
            keeperThread = null;
        }
        if (nativeKeepAwakeProcess != null) {
            try {
                nativeKeepAwakeProcess.destroy();
            } catch (Exception ignored) {
            }
            nativeKeepAwakeProcess = null;
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
