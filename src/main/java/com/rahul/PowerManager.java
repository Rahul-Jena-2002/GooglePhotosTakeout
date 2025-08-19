package com.rahul;

import java.awt.MouseInfo;
import java.awt.Point;
import java.awt.Robot;
import java.io.IOException;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Handles OS-specific power management tasks like keeping the system awake
 * or scheduling a shutdown.
 */
public class PowerManager {
    public enum PostAction {
        DO_NOTHING("Do Nothing"),
        KEEP_AWAKE("Keep System Awake"),
        SHUTDOWN("Shutdown When Finished");
        private final String displayName;
        PostAction(String d) { this.displayName = d; }
        @Override public String toString() { return displayName; }
    }

    private ScheduledExecutorService keepAwakeExecutor;

    public void startKeepingAwake() {
        if (keepAwakeExecutor != null && !keepAwakeExecutor.isShutdown()) return;
        keepAwakeExecutor = Executors.newSingleThreadScheduledExecutor();
        keepAwakeExecutor.scheduleAtFixedRate(() -> {
            try {
                Point p = MouseInfo.getPointerInfo().getLocation();
                new Robot().mouseMove(p.x + 1, p.y);
                new Robot().mouseMove(p.x, p.y);
            } catch (Exception e) { /* Failsafe */ }
        }, 0, 1, TimeUnit.MINUTES);
    }

    public void stopKeepingAwake() {
        if (keepAwakeExecutor != null) keepAwakeExecutor.shutdownNow();
    }

    public void shutdownComputer(int delayInSeconds) {
        String os = System.getProperty("os.name").toLowerCase();
        String cmd = os.contains("win") ? "shutdown -s -t " + delayInSeconds :
                (os.contains("nix") || os.contains("nux") || os.contains("mac")) ? "shutdown -h +" + (delayInSeconds / 60) : null;
        if (cmd == null) {
            System.err.println("Unsupported OS for shutdown: " + os);
            return;
        }
        try { Runtime.getRuntime().exec(cmd); } catch (IOException e) { System.err.println("Failed to execute shutdown: " + e.getMessage()); }
    }
}
