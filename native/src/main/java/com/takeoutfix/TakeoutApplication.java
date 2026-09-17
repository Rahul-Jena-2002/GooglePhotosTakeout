package com.takeoutfix;

import com.takeoutfix.gui.NativeDesktopGui;
import javax.swing.SwingUtilities;

/**
 * Main application launcher for TakeoutFix Desktop Application.
 * Boots natively into Swing UI with sub-second launch time and zero web server overhead.
 */
public class TakeoutApplication {

    public static void main(String[] args) {
        System.setProperty("java.awt.headless", "false");
        SwingUtilities.invokeLater(() -> {
            try {
                NativeDesktopGui gui = new NativeDesktopGui();
                gui.initAndShowGui();
            } catch (Throwable t) {
                System.err.println("Failed to launch TakeoutFix GUI: " + t.getMessage());
                t.printStackTrace();
            }
        });
    }
}
