package com.takeoutfix.ui.fx;

import java.awt.GraphicsEnvironment;
import java.util.Locale;

/**
 * Initializes and configures JavaFX Prism hardware-accelerated GPU graphics pipeline
 * (Direct3D 11 on Windows, Metal/ES2 on macOS, ES2/GL on Linux with software fallback).
 */
public final class FxHardwareManager {

    private static volatile boolean initialized = false;

    private FxHardwareManager() {}

    public static synchronized void initialize() {
        if (initialized) return;

        try {
            if (!GraphicsEnvironment.isHeadless()) {
                String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
                if (System.getProperty("prism.order") == null) {
                    if (os.contains("win")) {
                        System.setProperty("prism.order", "d3d,es2,sw");
                    } else if (os.contains("mac")) {
                        System.setProperty("prism.order", "es2,sw");
                    } else {
                        System.setProperty("prism.order", "es2,sw");
                    }
                }
                if (System.getProperty("prism.vsync") == null) {
                    System.setProperty("prism.vsync", "true");
                }
                if (System.getProperty("prism.text") == null) {
                    System.setProperty("prism.text", "native");
                }
                if (System.getProperty("prism.dirtyopts") == null) {
                    System.setProperty("prism.dirtyopts", "true");
                }
                if (System.getProperty("prism.subtextures") == null) {
                    System.setProperty("prism.subtextures", "true");
                }
                if (System.getProperty("prism.lcdtext") == null) {
                    System.setProperty("prism.lcdtext", "true");
                }
            }
        } catch (Throwable ignored) {
            // Safe fallback to default configuration
        }

        initialized = true;
    }
}
