package com.rahul;

import javax.swing.*;
import java.awt.*;

/**
 * The main GUI window for the application (the "View" in MVC).
 * Contains all UI components but has no application logic.
 */
public class AppView extends JFrame {
    JTextField inputField, outputField, exiftoolField;
    JButton browseInputBtn, browseOutputBtn, browseExiftoolBtn, startBtn, pauseBtn, cancelBtn;
    JProgressBar progressBar;
    JLabel statusLabel;
    JTextArea logArea;
    JComboBox<PowerManager.PostAction> postActionComboBox;

    public AppView() {
        setTitle("Google Takeout Metadata Restorer");
        setSize(800, 600);
        setDefaultCloseOperation(EXIT_ON_CLOSE);
        setLocationRelativeTo(null);
        setLayout(new GridBagLayout());

        GridBagConstraints gbc = new GridBagConstraints();
        gbc.insets = new Insets(5, 5, 5, 5);
        gbc.fill = GridBagConstraints.HORIZONTAL;

        JPanel configPanel = new JPanel(new GridBagLayout());
        configPanel.setBorder(BorderFactory.createTitledBorder("Configuration"));
        GridBagConstraints cGbc = new GridBagConstraints();
        cGbc.insets = new Insets(2, 2, 2, 2);
        cGbc.fill = GridBagConstraints.HORIZONTAL;

        inputField = new JTextField(40);
        outputField = new JTextField(40);
        exiftoolField = new JTextField(40);
        browseInputBtn = new JButton("Browse...");
        browseOutputBtn = new JButton("Browse...");
        browseExiftoolBtn = new JButton("Browse...");

        cGbc.gridx = 0; cGbc.gridy = 0;
        configPanel.add(new JLabel("Takeout Folder:"), cGbc);
        cGbc.gridx = 1; cGbc.weightx = 1;
        configPanel.add(inputField, cGbc);
        cGbc.gridx = 2; cGbc.weightx = 0;
        configPanel.add(browseInputBtn, cGbc);

        cGbc.gridx = 0; cGbc.gridy = 1;
        configPanel.add(new JLabel("Output Folder:"), cGbc);
        cGbc.gridx = 1;
        configPanel.add(outputField, cGbc);
        cGbc.gridx = 2;
        configPanel.add(browseOutputBtn, cGbc);

        cGbc.gridx = 0; cGbc.gridy = 2;
        configPanel.add(new JLabel("ExifTool Path:"), cGbc);
        cGbc.gridx = 1;
        configPanel.add(exiftoolField, cGbc);
        cGbc.gridx = 2;
        configPanel.add(browseExiftoolBtn, cGbc);

        JPanel controlsPanel = new JPanel(new FlowLayout(FlowLayout.CENTER));
        startBtn = new JButton("Start");
        pauseBtn = new JButton("Pause");
        cancelBtn = new JButton("Cancel");
        pauseBtn.setEnabled(false);
        cancelBtn.setEnabled(false);

        controlsPanel.add(new JLabel("After Finishing:"));
        postActionComboBox = new JComboBox<>(PowerManager.PostAction.values());
        controlsPanel.add(postActionComboBox);
        controlsPanel.add(Box.createHorizontalStrut(20));
        controlsPanel.add(startBtn);
        controlsPanel.add(pauseBtn);
        controlsPanel.add(cancelBtn);

        JPanel progressPanel = new JPanel(new BorderLayout(5, 5));
        progressBar = new JProgressBar(0, 100);
        progressBar.setStringPainted(true);
        statusLabel = new JLabel("Idle...");
        progressPanel.add(progressBar, BorderLayout.CENTER);
        progressPanel.add(statusLabel, BorderLayout.SOUTH);

        logArea = new JTextArea();
        logArea.setEditable(false);
        logArea.setFont(new Font("Monospaced", Font.PLAIN, 12));
        JScrollPane logScrollPane = new JScrollPane(logArea);
        logScrollPane.setBorder(BorderFactory.createTitledBorder("Log"));

        gbc.gridx = 0; gbc.gridy = 0; gbc.weightx = 1;
        add(configPanel, gbc);
        gbc.gridy = 1;
        add(controlsPanel, gbc);
        gbc.gridy = 2; gbc.insets = new Insets(10, 5, 10, 5);
        add(progressPanel, gbc);
        gbc.gridy = 3; gbc.weighty = 1; gbc.fill = GridBagConstraints.BOTH;
        add(logScrollPane, gbc);
    }

    public void setButtonsEnabled(boolean enabled) {
        startBtn.setEnabled(enabled);
        browseInputBtn.setEnabled(enabled);
        browseOutputBtn.setEnabled(enabled);
        browseExiftoolBtn.setEnabled(enabled);
        postActionComboBox.setEnabled(enabled);
        pauseBtn.setEnabled(!enabled);
        cancelBtn.setEnabled(!enabled);
    }
}
