package com.rahul.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.swing.*;
import javax.swing.filechooser.FileNameExtensionFilter;
import java.io.File;
import java.util.Collections;
import java.util.Map;

@RestController
@RequestMapping("/api/system")
public class SystemController {

    @GetMapping("/browse-folder")
    public ResponseEntity<Map<String, String>> browseFolder() {
        // Must run on EDT or simply inside this thread. JFileChooser is mostly thread-safe for basic use.
        final String[] selectedPath = {null};
        try {
            // Need to ensure headless is false, which it is in TakeoutApplication
            SwingUtilities.invokeAndWait(() -> {
                try {
                    UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
                } catch (Exception ignored) {}

                JFileChooser chooser = new JFileChooser();
                chooser.setFileSelectionMode(JFileChooser.DIRECTORIES_ONLY);
                chooser.setDialogTitle("Select Folder");
                chooser.setAcceptAllFileFilterUsed(false);

                // Try to bring to front using a hidden frame
                JFrame frame = new JFrame();
                frame.setAlwaysOnTop(true);
                frame.setLocationRelativeTo(null);
                
                int result = chooser.showOpenDialog(frame);
                if (result == JFileChooser.APPROVE_OPTION) {
                    File selectedFile = chooser.getSelectedFile();
                    selectedPath[0] = selectedFile.getAbsolutePath();
                }
                frame.dispose();
            });
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }

        if (selectedPath[0] != null) {
            return ResponseEntity.ok(Collections.singletonMap("path", selectedPath[0]));
        } else {
            return ResponseEntity.ok(Collections.singletonMap("path", ""));
        }
    }

    @GetMapping("/browse-zip")
    public ResponseEntity<Map<String, String>> browseZip() {
        final String[] selectedPath = {null};
        try {
            SwingUtilities.invokeAndWait(() -> {
                try {
                    UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
                } catch (Exception ignored) {}

                JFileChooser chooser = new JFileChooser();
                chooser.setFileSelectionMode(JFileChooser.FILES_ONLY);
                chooser.setFileFilter(new FileNameExtensionFilter("ZIP Archives", "zip"));
                chooser.setDialogTitle("Select ZIP File");
                chooser.setAcceptAllFileFilterUsed(false);

                JFrame frame = new JFrame();
                frame.setAlwaysOnTop(true);
                frame.setLocationRelativeTo(null);

                int result = chooser.showOpenDialog(frame);
                if (result == JFileChooser.APPROVE_OPTION) {
                    File selectedFile = chooser.getSelectedFile();
                    selectedPath[0] = selectedFile.getAbsolutePath();
                }
                frame.dispose();
            });
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }

        if (selectedPath[0] != null) {
            return ResponseEntity.ok(Collections.singletonMap("path", selectedPath[0]));
        } else {
            return ResponseEntity.ok(Collections.singletonMap("path", ""));
        }
    }
}
