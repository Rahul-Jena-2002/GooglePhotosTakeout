package com.photovault;

import com.photovault.core.HardwareAccelerationManager;
import javafx.application.Application;

/**
 * Main application entry point for PhotoVault.
 * Automatically configures GPU and cryptographic hardware acceleration on startup.
 */
public class PhotoVaultApp {

    public static void main(String[] args) {
        HardwareAccelerationManager.initialize();
        Application.launch(PhotoVaultFxApp.class, args);
    }
}
