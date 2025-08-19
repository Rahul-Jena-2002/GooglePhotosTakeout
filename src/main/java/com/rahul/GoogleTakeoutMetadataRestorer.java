package com.rahul;

import javax.swing.SwingUtilities;

/**
 * Main entry point for the Google Takeout Metadata Restorer application.
 * Initializes and displays the user interface.
 */
public class GoogleTakeoutMetadataRestorer {
    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> {
            AppView view = new AppView();
            new AppController(view); // The controller links the view and the logic
            view.setVisible(true);
        });
    }
}