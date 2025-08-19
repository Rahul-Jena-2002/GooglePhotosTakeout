package com.rahul;

import javax.swing.*;
import java.io.File;
import java.util.prefs.Preferences;

/**
 * The "Controller" in MVC. Connects user actions from the AppView
 * to the application logic in ProcessingTask. Handles settings and validation.
 */
public class AppController {
    private final AppView view;
    private ProcessingTask currentTask;
    private final Preferences prefs;
    private static final String EXIFTOOL_PATH_KEY = "exiftoolPath";

    public AppController(AppView view) {
        this.view = view;
        this.prefs = Preferences.userNodeForPackage(AppController.class);
        loadSettings();
        attachListeners();
    }

    private void loadSettings() {
        view.exiftoolField.setText(prefs.get(EXIFTOOL_PATH_KEY, ""));
    }

    private void saveSettings() {
        prefs.put(EXIFTOOL_PATH_KEY, view.exiftoolField.getText());
    }

    private void attachListeners() {
        view.browseInputBtn.addActionListener(e -> chooseFolder(view.inputField));
        view.browseOutputBtn.addActionListener(e -> chooseFolder(view.outputField));
        view.browseExiftoolBtn.addActionListener(e -> chooseFile(view.exiftoolField));
        view.startBtn.addActionListener(e -> startProcessing());
        view.pauseBtn.addActionListener(e -> togglePause());
        view.cancelBtn.addActionListener(e -> cancelProcessing());
    }

    private void chooseFolder(JTextField field) {
        JFileChooser chooser = new JFileChooser();
        chooser.setFileSelectionMode(JFileChooser.DIRECTORIES_ONLY);
        if (chooser.showOpenDialog(view) == JFileChooser.APPROVE_OPTION) {
            field.setText(chooser.getSelectedFile().getAbsolutePath());
        }
    }

    private void chooseFile(JTextField field) {
        JFileChooser chooser = new JFileChooser();
        chooser.setFileSelectionMode(JFileChooser.FILES_ONLY);
        if (chooser.showOpenDialog(view) == JFileChooser.APPROVE_OPTION) {
            field.setText(chooser.getSelectedFile().getAbsolutePath());
        }
    }

    private void startProcessing() {
        String inputPath = view.inputField.getText().trim();
        String outputPath = view.outputField.getText().trim();
        String exiftoolPath = view.exiftoolField.getText().trim();

        if (inputPath.isEmpty() || outputPath.isEmpty() || exiftoolPath.isEmpty()) {
            JOptionPane.showMessageDialog(view, "Please select input, output, and ExifTool paths.", "Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        if (!new File(exiftoolPath).exists()) {
            JOptionPane.showMessageDialog(view, "ExifTool executable not found at the specified path.", "Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        saveSettings();
        view.setButtonsEnabled(false);
        view.logArea.setText("");
        PowerManager.PostAction action = (PowerManager.PostAction) view.postActionComboBox.getSelectedItem();
        currentTask = new ProcessingTask(inputPath, outputPath, exiftoolPath, view, action);
        currentTask.execute();
    }

    private void togglePause() {
        if (currentTask != null) {
            currentTask.setPaused(!currentTask.isPaused());
            view.pauseBtn.setText(currentTask.isPaused() ? "Resume" : "Pause");
        }
    }

    private void cancelProcessing() {
        if (currentTask != null) {
            currentTask.cancel(true);
        }
    }
}
