package com.takeoutfix.restore;

import java.awt.Robot;
import java.awt.event.KeyEvent;
import java.io.IOException;
import java.util.List;
import java.util.Locale;

/**
 * Keeps the display awake by simulating minimal activity on an interval.
 * Also supports post-finish shutdown.
 */
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
            keeperThread.interrupt();
            try {
                keeperThread.join(500);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
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

    static List<String> shutdownCommand(String osName, int delaySeconds) {
        if (delaySeconds < 0) throw new IllegalArgumentException("Shutdown delay cannot be negative.");
        String os = osName.toLowerCase(Locale.ROOT);
        if (os.contains("mac") || os.contains("darwin")) {
            return List.of("osascript", "-e", "delay " + delaySeconds, "-e", "tell app \"System Events\" to shut down");
        }
        if (os.contains("win")) return List.of("shutdown", "/s", "/t", String.valueOf(delaySeconds));
        if (os.contains("linux")) {
            long minutes = (delaySeconds + 59L) / 60L;
            return List.of("shutdown", "-h", "+" + minutes);
        }
        throw new IllegalArgumentException("Automatic shutdown is not supported on this operating system.");
    }

    public Process runShutdownCommand(int delay) throws IOException {
        return new ProcessBuilder(shutdownCommand(System.getProperty("os.name", ""), delay))
                .redirectErrorStream(true)
                .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                .start();
    }
}
