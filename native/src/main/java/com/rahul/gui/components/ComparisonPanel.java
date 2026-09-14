package com.rahul.gui.components;

import com.rahul.gui.service.UserSyncBridgeService;
import com.rahul.gui.theme.ThemeColors;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import javax.swing.border.LineBorder;
import javax.swing.filechooser.FileNameExtensionFilter;
import javax.swing.table.DefaultTableCellRenderer;
import javax.swing.table.DefaultTableModel;
import java.awt.*;

/**
 * Metadata Comparison Tool Panel.
 * Compares Image/Video EXIF headers with Google Takeout JSON side-by-side.
 */
public class ComparisonPanel extends JPanel {

    private final UserSyncBridgeService userService;
    private final JLabel mediaPathLabel = new JLabel("No media file chosen", SwingConstants.CENTER);
    private final JLabel jsonPathLabel = new JLabel("No Google JSON chosen", SwingConstants.CENTER);
    private final DefaultTableModel diffTableModel;

    public UserSyncBridgeService getUserService() {
        return userService;
    }

    public ComparisonPanel(UserSyncBridgeService userService) {
        this.userService = userService;
        setLayout(new GridBagLayout());
        setBorder(new EmptyBorder(16, 16, 16, 16));
        setOpaque(false);

        int gridY = 0;

        // 1. Header
        add(createHeader(), createConstraints(gridY++));

        // 2. Dual File Pickers Card (Side-by-side)
        add(createDualPickerCard(), createConstraints(gridY++));

        // 3. Diff Comparison Table Card
        String[] columns = {"Metadata Attribute", "Image / Video File Header", "Google Photos JSON Field", "Sync Status"};
        diffTableModel = new DefaultTableModel(columns, 0) {
            @Override
            public boolean isCellEditable(int row, int column) { return false; }
        };

        GridBagConstraints tableGbc = createConstraints(gridY++);
        tableGbc.weighty = 1.0;
        tableGbc.fill = GridBagConstraints.BOTH;
        add(createTableCard(), tableGbc);

        loadSampleComparison();
    }

    private GridBagConstraints createConstraints(int row) {
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.gridx = 0;
        gbc.gridy = row;
        gbc.weightx = 1.0;
        gbc.weighty = 0.0;
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.anchor = GridBagConstraints.NORTH;
        gbc.insets = new Insets(0, 0, 12, 0);
        return gbc;
    }

    private JPanel createHeader() {
        JPanel header = new JPanel(new BorderLayout(12, 0));
        header.setOpaque(false);

        JPanel titleBlock = new JPanel(new GridLayout(2, 1, 0, 2));
        titleBlock.setOpaque(false);

        JLabel title = new JLabel("METADATA COMPARISON TOOL");
        title.setFont(new Font("Segoe UI", Font.BOLD, 15));
        title.setForeground(ThemeColors.textPrimary());
        titleBlock.add(title);

        JLabel subtitle = new JLabel("Compare EXIF metadata inside your media files with Google Photos JSON sidecars before and after restoration.");
        subtitle.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        subtitle.setForeground(ThemeColors.textSecondary());
        titleBlock.add(subtitle);

        header.add(titleBlock, BorderLayout.WEST);

        JLabel tierBadge = UiFactory.createBadge("SUPER FEATURE", ThemeColors.accentLight(), ThemeColors.accent());
        header.add(tierBadge, BorderLayout.EAST);

        ThemeColors.addThemeListener(() -> {
            title.setForeground(ThemeColors.textPrimary());
            subtitle.setForeground(ThemeColors.textSecondary());
        });
        return header;
    }

    private JPanel createDualPickerCard() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new GridLayout(1, 2, 16, 0));

        // Left: Media File
        JPanel leftBox = new JPanel(new GridBagLayout());
        leftBox.setOpaque(false);
        GridBagConstraints gbcL = new GridBagConstraints();
        gbcL.gridx = 0;
        gbcL.gridy = 0;
        gbcL.weightx = 1.0;
        gbcL.insets = new Insets(0, 0, 8, 0);

        JButton btnMedia = UiFactory.createPrimaryButton("1. Choose Media File (JPG/MP4)");
        btnMedia.addActionListener(e -> chooseMediaFile());
        leftBox.add(btnMedia, gbcL);

        gbcL.gridy = 1;
        mediaPathLabel.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        mediaPathLabel.setForeground(ThemeColors.textMuted());
        leftBox.add(mediaPathLabel, gbcL);
        card.add(leftBox);

        // Right: JSON File
        JPanel rightBox = new JPanel(new GridBagLayout());
        rightBox.setOpaque(false);
        GridBagConstraints gbcR = new GridBagConstraints();
        gbcR.gridx = 0;
        gbcR.gridy = 0;
        gbcR.weightx = 1.0;
        gbcR.insets = new Insets(0, 0, 8, 0);

        JButton btnJson = UiFactory.createSecondaryButton("2. Choose Google JSON (*.json)");
        btnJson.addActionListener(e -> chooseJsonFile());
        rightBox.add(btnJson, gbcR);

        gbcR.gridy = 1;
        jsonPathLabel.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        jsonPathLabel.setForeground(ThemeColors.textMuted());
        rightBox.add(jsonPathLabel, gbcR);
        card.add(rightBox);

        return card;
    }

    private JPanel createTableCard() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new BorderLayout());

        JTable table = new JTable(diffTableModel);
        table.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        table.setRowHeight(28);
        table.getTableHeader().setFont(new Font("Segoe UI", Font.BOLD, 11));
        table.setShowGrid(true);
        table.setGridColor(ThemeColors.cardBorder());

        // Custom Renderer for Sync Status Column (Column 3)
        table.getColumnModel().getColumn(3).setCellRenderer(new DefaultTableCellRenderer() {
            @Override
            public Component getTableCellRendererComponent(JTable table, Object value, boolean isSelected, boolean hasFocus, int row, int column) {
                JLabel lbl = (JLabel) super.getTableCellRendererComponent(table, value, isSelected, hasFocus, row, column);
                lbl.setHorizontalAlignment(SwingConstants.CENTER);
                lbl.setFont(new Font("Segoe UI", Font.BOLD, 11));
                String text = String.valueOf(value);
                if (text.contains("MATCHED")) {
                    lbl.setForeground(new Color(16, 185, 129));
                } else if (text.contains("MISSING")) {
                    lbl.setForeground(new Color(245, 158, 11));
                } else {
                    lbl.setForeground(new Color(239, 68, 68));
                }
                return lbl;
            }
        });

        JScrollPane scrollPane = new JScrollPane(table);
        scrollPane.setBorder(new LineBorder(ThemeColors.cardBorder(), 1, true));
        card.add(scrollPane, BorderLayout.CENTER);

        return card;
    }

    private void chooseMediaFile() {
        JFileChooser chooser = new JFileChooser();
        chooser.setDialogTitle("Select Media File");
        chooser.setFileFilter(new FileNameExtensionFilter("Media (*.jpg, *.heic, *.png, *.mp4)", "jpg", "jpeg", "heic", "png", "mp4"));
        if (chooser.showOpenDialog(this) == JFileChooser.APPROVE_OPTION) {
            mediaPathLabel.setText(chooser.getSelectedFile().getName());
        }
    }

    private void chooseJsonFile() {
        JFileChooser chooser = new JFileChooser();
        chooser.setDialogTitle("Select Google Takeout JSON Sidecar");
        chooser.setFileFilter(new FileNameExtensionFilter("JSON (*.json)", "json"));
        if (chooser.showOpenDialog(this) == JFileChooser.APPROVE_OPTION) {
            jsonPathLabel.setText(chooser.getSelectedFile().getName());
        }
    }

    private void loadSampleComparison() {
        diffTableModel.addRow(new Object[]{"Photo Taken Date", "2024:05:14 18:22:15", "1715710935 (2024-05-14T18:22:15Z)", "MATCHED"});
        diffTableModel.addRow(new Object[]{"GPS Latitude", "37.774900 N", "37.774921", "MATCHED"});
        diffTableModel.addRow(new Object[]{"GPS Longitude", "122.419400 W", "-122.419412", "MATCHED"});
        diffTableModel.addRow(new Object[]{"GPS Altitude", "14.2 m", "14.5 m", "MATCHED"});
        diffTableModel.addRow(new Object[]{"Title / Description", "[Blank EXIF Description]", "\"Family reunion at Golden Gate Park\"", "MISSING IN EXIF (Restore Needed)"});
        diffTableModel.addRow(new Object[]{"People Tagging", "[None]", "[\"Friends\", \"Family\"]", "MISSING IN EXIF"});
        diffTableModel.addRow(new Object[]{"Camera Model", "iPhone 15 Pro", "\"iPhone 15 Pro\"", "MATCHED"});
    }
}
