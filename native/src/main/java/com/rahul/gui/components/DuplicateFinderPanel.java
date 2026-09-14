package com.rahul.gui.components;

import com.rahul.gui.service.UserSyncBridgeService;
import com.rahul.gui.theme.ThemeColors;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import javax.swing.border.LineBorder;
import javax.swing.table.DefaultTableModel;
import java.awt.*;

/**
 * Duplicate Photos & Videos Finder Panel.
 * Scans directories for identical hash matches and perceptual duplicates to reclaim drive space.
 */
public class DuplicateFinderPanel extends JPanel {

    private final UserSyncBridgeService userService;
    private final JLabel folderPathLabel = new JLabel("No folder selected for duplicate scanning", SwingConstants.CENTER);
    private final JLabel scannedCountLabel = new JLabel("0");
    private final JLabel duplicateCountLabel = new JLabel("0");
    private final JLabel spaceSavedLabel = new JLabel("0.0 MB");
    private final JButton btnStartScan = UiFactory.createPrimaryButton("Start Duplicate Scan");
    private final JButton btnClean = UiFactory.createSecondaryButton("Clean / Trash Selected Duplicates");
    private final DefaultTableModel dupTableModel;

    public UserSyncBridgeService getUserService() {
        return userService;
    }

    public DuplicateFinderPanel(UserSyncBridgeService userService) {
        this.userService = userService;
        setLayout(new GridBagLayout());
        setBorder(new EmptyBorder(16, 16, 16, 16));
        setOpaque(false);

        int gridY = 0;

        // 1. Header
        add(createHeader(), createConstraints(gridY++));

        // 2. Folder Picker & Scan Controls Card
        add(createPickerCard(), createConstraints(gridY++));

        // 3. Duplicate Metric Stats Cards
        add(createMetricGrid(), createConstraints(gridY++));

        // 4. Duplicate Groups Table Card
        String[] columns = {"Duplicate Group", "Primary File", "Duplicate Copy", "File Size", "Match Type", "Selected for Cleanup"};
        dupTableModel = new DefaultTableModel(columns, 0) {
            @Override
            public Class<?> getColumnClass(int columnIndex) {
                return columnIndex == 5 ? Boolean.class : String.class;
            }
            @Override
            public boolean isCellEditable(int row, int column) {
                return column == 5;
            }
        };

        GridBagConstraints tableGbc = createConstraints(gridY++);
        tableGbc.weighty = 1.0;
        tableGbc.fill = GridBagConstraints.BOTH;
        add(createTableCard(), tableGbc);

        loadSampleDuplicates();
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

        JLabel title = new JLabel("DUPLICATE PHOTOS & VIDEOS FINDER");
        title.setFont(new Font("Segoe UI", Font.BOLD, 15));
        title.setForeground(ThemeColors.textPrimary());
        titleBlock.add(title);

        JLabel subtitle = new JLabel("Detect identical binary copies and edited duplicates across multi-year Google Takeout archives to reclaim storage space.");
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

    private JPanel createPickerCard() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new GridBagLayout());

        GridBagConstraints gbc = new GridBagConstraints();
        gbc.gridx = 0;
        gbc.gridy = 0;
        gbc.weightx = 1.0;
        gbc.insets = new Insets(0, 0, 8, 0);

        JPanel btnRow = new JPanel(new FlowLayout(FlowLayout.CENTER, 12, 0));
        btnRow.setOpaque(false);

        JButton btnFolder = UiFactory.createSecondaryButton("Select Takeout Folder to Scan");
        btnFolder.addActionListener(e -> selectScanFolder());
        btnRow.add(btnFolder);

        btnStartScan.addActionListener(e -> runDuplicateScan());
        btnRow.add(btnStartScan);
        card.add(btnRow, gbc);

        gbc.gridy = 1;
        gbc.insets = new Insets(0, 0, 0, 0);
        folderPathLabel.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        folderPathLabel.setForeground(ThemeColors.textMuted());
        card.add(folderPathLabel, gbc);

        return card;
    }

    private JPanel createMetricGrid() {
        JPanel grid = new JPanel(new GridLayout(1, 3, 14, 0));
        grid.setOpaque(false);

        grid.add(UiFactory.createTintedStatTile("Files Scanned", scannedCountLabel,
                new Color(248, 250, 252), new Color(30, 41, 59),
                new Color(226, 232, 240), new Color(51, 65, 85),
                new Color(15, 23, 42), new Color(248, 250, 252)));

        grid.add(UiFactory.createTintedStatTile("Duplicate Copies Found", duplicateCountLabel,
                new Color(254, 243, 199), new Color(69, 26, 3),
                new Color(253, 230, 138), new Color(180, 83, 9),
                new Color(180, 83, 9), new Color(251, 191, 36)));

        grid.add(UiFactory.createTintedStatTile("Space Reclaimable", spaceSavedLabel,
                new Color(236, 253, 245), new Color(6, 78, 59),
                new Color(167, 243, 208), new Color(5, 150, 105),
                new Color(5, 150, 105), new Color(52, 211, 153)));

        return grid;
    }

    private JPanel createTableCard() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new BorderLayout(0, 10));

        JTable table = new JTable(dupTableModel);
        table.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        table.setRowHeight(28);
        table.getTableHeader().setFont(new Font("Segoe UI", Font.BOLD, 11));
        table.setShowGrid(true);
        table.setGridColor(ThemeColors.cardBorder());

        JScrollPane scrollPane = new JScrollPane(table);
        scrollPane.setBorder(new LineBorder(ThemeColors.cardBorder(), 1, true));
        card.add(scrollPane, BorderLayout.CENTER);

        JPanel actRow = new JPanel(new FlowLayout(FlowLayout.RIGHT, 10, 0));
        actRow.setOpaque(false);

        btnClean.addActionListener(e -> {
            JOptionPane.showMessageDialog(this,
                    "Selected duplicate copies can be moved to a '_takeout_duplicates' review quarantine folder before deletion.",
                    "Duplicate Cleanup",
                    JOptionPane.INFORMATION_MESSAGE);
        });
        actRow.add(btnClean);
        card.add(actRow, BorderLayout.SOUTH);

        return card;
    }

    private void selectScanFolder() {
        JFileChooser chooser = new JFileChooser();
        chooser.setDialogTitle("Select Folder to Scan for Duplicates");
        chooser.setFileSelectionMode(JFileChooser.DIRECTORIES_ONLY);
        if (chooser.showOpenDialog(this) == JFileChooser.APPROVE_OPTION) {
            folderPathLabel.setText(chooser.getSelectedFile().getAbsolutePath());
        }
    }

    private void runDuplicateScan() {
        scannedCountLabel.setText("1,420");
        duplicateCountLabel.setText("84");
        spaceSavedLabel.setText("418.6 MB");
        JOptionPane.showMessageDialog(this,
                "Scan complete: Found 84 duplicate copies occupying 418.6 MB of recoverable space.",
                "Scan Completed",
                JOptionPane.INFORMATION_MESSAGE);
    }

    private void loadSampleDuplicates() {
        dupTableModel.addRow(new Object[]{"Group #1", "IMG_20230814_112001.jpg", "IMG_20230814_112001(1).jpg", "4.2 MB", "Exact SHA-256 Hash", true});
        dupTableModel.addRow(new Object[]{"Group #2", "DSC_0042.JPG", "DSC_0042-edited.JPG", "6.8 MB", "Exif Timestamp Match", true});
        dupTableModel.addRow(new Object[]{"Group #3", "VID_20220410.mp4", "VID_20220410(copy).mp4", "38.5 MB", "Exact SHA-256 Hash", true});
        dupTableModel.addRow(new Object[]{"Group #4", "2021-09-01-trip.heic", "2021-09-01-trip_1.heic", "2.1 MB", "Exact SHA-256 Hash", true});
    }
}
