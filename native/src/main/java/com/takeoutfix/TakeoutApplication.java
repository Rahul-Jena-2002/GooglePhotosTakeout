package com.takeoutfix;

import com.takeoutfix.app.AppSpringConfig;
import com.takeoutfix.app.NativeDesktopGui;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

import javax.swing.SwingUtilities;

/**
 * Main application launcher for TakeoutFix Desktop Application.
 * Boots natively into Swing UI via Spring Framework Core DI (zero web server overhead).
 */
public class TakeoutApplication {

    private static final Logger log = LoggerFactory.getLogger(TakeoutApplication.class);

    @SuppressWarnings("resource")
    public static void main(String[] args) {
        System.setProperty("java.awt.headless", "false");

        // Decouple from java.exe / javaw.exe so Windows Taskbar pins and displays TakeoutFix's custom icon
        try {
            if (System.getProperty("os.name", "").toLowerCase().contains("win")) {
                com.sun.jna.platform.win32.Shell32.INSTANCE.SetCurrentProcessExplicitAppUserModelID(
                        new com.sun.jna.WString("TakeoutFix.Desktop"));
            }
        } catch (Throwable ignored) {
            // Non-fatal if JNA or platform library is not available
        }

        // Pure Spring Framework Core Container (Zero web dependencies, zero servers)
        AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext(AppSpringConfig.class);
        context.registerShutdownHook();

        SwingUtilities.invokeLater(() -> {
            try {
                NativeDesktopGui gui = context.getBean(NativeDesktopGui.class);
                gui.initAndShowGui();
            } catch (Exception e) {
                log.error("Failed to launch TakeoutFix GUI", e);
            }
        });
    }
}
