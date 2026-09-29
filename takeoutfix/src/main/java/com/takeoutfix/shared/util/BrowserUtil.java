package com.takeoutfix.shared.util;

import java.awt.Desktop;
import java.net.URI;
import java.util.Locale;

/**
 * Robust cross-platform browser opening utility with IDE-grade fallbacks.
 * Handles headless edge cases, Linux xdg-open/gio, macOS open, and Windows rundll32.
 */
public class BrowserUtil {

    public static boolean openBrowser(String url) {
        if (url == null || url.isBlank()) {
            return false;
        }

        // 1. Try Java Desktop API first
        try {
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(new URI(url));
                return true;
            }
        } catch (Throwable t) {
            System.err.println("[BrowserUtil] Desktop.browse failed: " + t.getMessage());
        }

        // 2. OS-specific shell fallback
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        try {
            if (os.contains("win")) {
                new ProcessBuilder("rundll32", "url.dll,FileProtocolHandler", url).start();
                return true;
            } else if (os.contains("mac")) {
                new ProcessBuilder("open", url).start();
                return true;
            } else if (os.contains("nix") || os.contains("nux") || os.contains("aix")) {
                // Try xdg-open, gio open, gnome-open in order
                String[] commands = {"xdg-open", "gio", "gnome-open", "kfmclient"};
                for (String cmd : commands) {
                    try {
                        if ("gio".equals(cmd)) {
                            new ProcessBuilder("gio", "open", url).start();
                        } else if ("kfmclient".equals(cmd)) {
                            new ProcessBuilder("kfmclient", "openURL", url).start();
                        } else {
                            new ProcessBuilder(cmd, url).start();
                        }
                        return true;
                    } catch (Throwable ignored) {}
                }
            }
        } catch (Throwable t) {
            System.err.println("[BrowserUtil] Shell launcher failed: " + t.getMessage());
        }

        return false;
    }
}
