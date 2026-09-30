package com.takeoutfix.updates;

import javafx.application.Platform;

import java.io.File;
import java.io.IOException;
import java.util.Locale;

/**
 * Prepares and launches external installers or updated binaries upon application shutdown.
 * Operating system processes cannot cleanly overwrite active running executable binaries on Windows,
 * so this orchestrates spawning the external installer/runtime and terminating the current JavaFX process.
 *
 * Safe engineering policy: OTA updates only modify application binaries.
 * User photo libraries, duplicate quarantine vaults, metadata backups, and user settings
 * in ~/.takeoutfix remain completely untouched.
 */
public class UpdateInstaller {

    /**
     * Launches the installer or updated package and shuts down the current application.
     *
     * @param packageFile The verified downloaded update file (.msi, .exe, or .jar)
     * @throws IOException If process launch fails
     */
    public static void launchAndExit(File packageFile) throws IOException {
        if (packageFile == null || !packageFile.exists()) {
            throw new IllegalArgumentException("Update package does not exist: " + packageFile);
        }

        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        String fileName = packageFile.getName().toLowerCase(Locale.ROOT);

        ProcessBuilder processBuilder;

        if (os.contains("win")) {
            if (fileName.endsWith(".msi")) {
                // Windows Installer: launch msiexec
                processBuilder = new ProcessBuilder("msiexec", "/i", packageFile.getAbsolutePath());
            } else if (fileName.endsWith(".exe")) {
                // Native Windows Executable installer: delay launch by 1s to allow current JVM process to fully terminate
                processBuilder = new ProcessBuilder("cmd.exe", "/c", "timeout /t 1 /nobreak >nul & start \"\" \"" + packageFile.getAbsolutePath() + "\"");
            } else if (fileName.endsWith(".jar")) {
                // Java Archive runner: delay launch by 1s
                processBuilder = new ProcessBuilder("cmd.exe", "/c", "timeout /t 1 /nobreak >nul & javaw -jar \"" + packageFile.getAbsolutePath() + "\"");
            } else {
                processBuilder = new ProcessBuilder("explorer.exe", packageFile.getParentFile().getAbsolutePath());
            }
        } else if (os.contains("mac") || os.contains("darwin")) {
            if (fileName.endsWith(".dmg")) {
                processBuilder = new ProcessBuilder("open", packageFile.getAbsolutePath());
            } else if (fileName.endsWith(".jar")) {
                processBuilder = new ProcessBuilder("java", "-jar", packageFile.getAbsolutePath());
            } else {
                processBuilder = new ProcessBuilder("open", packageFile.getParentFile().getAbsolutePath());
            }
        } else {
            // Linux
            if (fileName.endsWith(".deb")) {
                processBuilder = new ProcessBuilder("xdg-open", packageFile.getAbsolutePath());
            } else if (fileName.endsWith(".jar")) {
                processBuilder = new ProcessBuilder("java", "-jar", packageFile.getAbsolutePath());
            } else {
                processBuilder = new ProcessBuilder("xdg-open", packageFile.getParentFile().getAbsolutePath());
            }
        }

        // Start external installer/updater process
        processBuilder.start();

        // Gracefully terminate JavaFX and JVM
        Platform.runLater(() -> {
            try {
                Platform.exit();
            } finally {
                System.exit(0);
            }
        });
    }
}
