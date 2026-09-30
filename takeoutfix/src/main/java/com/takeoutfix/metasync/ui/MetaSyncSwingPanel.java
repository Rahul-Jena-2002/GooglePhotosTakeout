package com.takeoutfix.metasync.ui;

import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.metasync.core.*;
import com.takeoutfix.metasync.model.DiffStatus;
import com.takeoutfix.metasync.model.PhotoPair;
import com.takeoutfix.metasync.model.TagDifference;
import com.takeoutfix.restore.infrastructure.NativeExifToolEngine;
import com.takeoutfix.shared.theme.ThemeColors;
import com.takeoutfix.shared.ui.UiFactory;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import javax.swing.border.LineBorder;
import javax.swing.table.DefaultTableCellRenderer;
import javax.swing.table.DefaultTableModel;
import java.awt.*;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

/**
 * MetaSync Swing FlatLaf Panel for RAW/JPEG metadata synchronization.
 * Integrates directly into TakeoutFix's main tool switcher dropdown.
 */
public class MetaSyncSwingPanel extends JPanel {

    private final UserSyncBridgeService userService;
    private final NativeExifToolEngine exifToolEngine;
    private final MetadataSyncService syncService;
    private final MetadataReader metadataReader;
    private final MetadataComparator metadataComparator;
    private final MetadataWriter metadataWriter;
    private final WriteSafetyService writeSafetyService;

    // File / Directory state
    private File rawDirectory = null;
    private File jpegDirectory = null;
    private final List<PhotoPair> currentPairs = new ArrayList<>();
    private PhotoPair selectedPair = null;

    // UI Components
    private final JLabel rawDirLabel = new JLabel("No RAW folder selected", SwingConstants.CENTER);
    private final JLabel jpegDirLabel = new JLabel("No JPEG/Export folder selected", SwingConstants.CENTER);
    private final JCheckBox sameFolderCheckbox = new JCheckBox("RAW & JPEG are in the same folder", false);
    private JButton btnScanPairs;

    // Pairs Table
    private final DefaultTableModel pairsTableModel;
    private final JTable pairsTable;

    // Diff Table
    private final DefaultTableModel diffTableModel;
    private final JTable diffTable;
    private final List<TagDifference> currentDifferences = new ArrayList<>();

    // Controls
    private final JCheckBox backupCheckbox = new JCheckBox("Create .original backup file before writing", true);
    private final JButton btnSelectAllDiffs;
    private final JButton btnSelectNone;
    private final JButton btnSyncSingle;
    private final JButton btnSyncBatch;
    private final JProgressBar progressBar;
    private final JLabel statusLabel;

    public MetaSyncSwingPanel(UserSyncBridgeService userService) {
        this.userService = userService;
        this.exifToolEngine = NativeExifToolEngine.getDefault();
        this.metadataReader = new MetadataReader(exifToolEngine);
        this.metadataComparator = new MetadataComparator();
        this.writeSafetyService = new WriteSafetyService(metadataReader);
        this.metadataWriter = new MetadataWriter(exifToolEngine, writeSafetyService);
        this.syncService = new MetadataSyncService(exifToolEngine);

        // Initialize pairs table model & table
        String[] pairCols = {"RAW Original File", "Exported JPEG", "XMP Sidecar", "Sync Status"};
        pairsTableModel = new DefaultTableModel(pairCols, 0) {
            @Override
            public boolean isCellEditable(int row, int col) { return false; }
        };
        pairsTable = new JTable(pairsTableModel);
        pairsTable.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        pairsTable.setRowHeight(24);
        pairsTable.setShowGrid(true);
        pairsTable.setGridColor(ThemeColors.cardBorder());
        pairsTable.setSelectionMode(ListSelectionModel.SINGLE_SELECTION);
        pairsTable.getSelectionModel().addListSelectionListener(e -> {
            if (!e.getValueIsAdjusting()) {
                int row = pairsTable.getSelectedRow();
                if (row >= 0 && row < currentPairs.size()) {
                    selectPair(currentPairs.get(row));
                }
            }
        });

        // Initialize diff table model & table
        String[] diffColumns = {"Sync", "Group", "Tag Name", "RAW Original Value", "JPEG Export Value", "Status"};
        diffTableModel = new DefaultTableModel(diffColumns, 0) {
            @Override
            public Class<?> getColumnClass(int columnIndex) {
                return columnIndex == 0 ? Boolean.class : String.class;
            }

            @Override
            public boolean isCellEditable(int row, int column) {
                return column == 0;
            }
        };

        diffTable = new JTable(diffTableModel);
        diffTable.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        diffTable.setRowHeight(28);
        diffTable.getTableHeader().setFont(new Font("Segoe UI", Font.BOLD, 11));
        diffTable.setShowGrid(true);
        diffTable.setGridColor(ThemeColors.cardBorder());

        // Column widths
        diffTable.getColumnModel().getColumn(0).setMaxWidth(50);
        diffTable.getColumnModel().getColumn(1).setPreferredWidth(100);
        diffTable.getColumnModel().getColumn(2).setPreferredWidth(140);
        diffTable.getColumnModel().getColumn(3).setPreferredWidth(220);
        diffTable.getColumnModel().getColumn(4).setPreferredWidth(220);
        diffTable.getColumnModel().getColumn(5).setPreferredWidth(120);

        // Custom Renderer for Status Column
        diffTable.getColumnModel().getColumn(5).setCellRenderer(new DefaultTableCellRenderer() {
            @Override
            public Component getTableCellRendererComponent(JTable table, Object value, boolean isSelected, boolean hasFocus, int row, int column) {
                JLabel lbl = (JLabel) super.getTableCellRendererComponent(table, value, isSelected, hasFocus, row, column);
                lbl.setHorizontalAlignment(SwingConstants.CENTER);
                lbl.setFont(new Font("Segoe UI", Font.BOLD, 11));
                String text = String.valueOf(value);
                if ("MATCH".equalsIgnoreCase(text)) {
                    lbl.setForeground(new Color(16, 185, 129));
                } else if ("DIFFERENT".equalsIgnoreCase(text)) {
                    lbl.setForeground(new Color(245, 158, 11));
                } else if ("SOURCE_ONLY".equalsIgnoreCase(text)) {
                    lbl.setForeground(new Color(59, 130, 246));
                } else {
                    lbl.setForeground(ThemeColors.textMuted());
                }
                return lbl;
            }
        });

        setLayout(new BorderLayout(0, 10));
        setBorder(new EmptyBorder(12, 14, 12, 14));
        setOpaque(false);

        // Header Card
        add(createHeaderCard(), BorderLayout.NORTH);

        // Center Split (Top: Directory + Pairs List, Bottom: Diff Comparison Table)
        JPanel centerPanel = new JPanel(new BorderLayout(0, 10));
        centerPanel.setOpaque(false);

        centerPanel.add(createDirectoryAndPairsCard(), BorderLayout.NORTH);

        // Diff Table Card
        JPanel diffCard = UiFactory.createCard();
        diffCard.setLayout(new BorderLayout(0, 8));

        JPanel diffHead = new JPanel(new BorderLayout());
        diffHead.setOpaque(false);
        JLabel diffTitle = new JLabel("METADATA DIFFERENCE INSPECTOR (RAW ➔ JPEG)");
        diffTitle.setFont(new Font("Segoe UI", Font.BOLD, 11));
        diffTitle.setForeground(ThemeColors.textMuted());
        diffHead.add(diffTitle, BorderLayout.WEST);

        JPanel diffQuickBtns = new JPanel(new FlowLayout(FlowLayout.RIGHT, 6, 0));
        diffQuickBtns.setOpaque(false);
        btnSelectAllDiffs = UiFactory.createSecondaryButton("Select All Differences");
        btnSelectAllDiffs.setFont(new Font("Segoe UI", Font.BOLD, 10));
        btnSelectAllDiffs.setPreferredSize(new Dimension(160, 26));
        btnSelectAllDiffs.addActionListener(e -> selectAllDifferences(true));

        btnSelectNone = UiFactory.createSecondaryButton("Select None");
        btnSelectNone.setFont(new Font("Segoe UI", Font.BOLD, 10));
        btnSelectNone.setPreferredSize(new Dimension(100, 26));
        btnSelectNone.addActionListener(e -> selectAllDifferences(false));

        diffQuickBtns.add(btnSelectAllDiffs);
        diffQuickBtns.add(btnSelectNone);
        diffHead.add(diffQuickBtns, BorderLayout.EAST);
        diffCard.add(diffHead, BorderLayout.NORTH);

        JScrollPane diffScroll = new JScrollPane(diffTable);
        diffScroll.setBorder(new LineBorder(ThemeColors.cardBorder(), 1, true));
        diffCard.add(diffScroll, BorderLayout.CENTER);

        centerPanel.add(diffCard, BorderLayout.CENTER);
        add(centerPanel, BorderLayout.CENTER);

        // Bottom Action Bar
        btnSyncSingle = UiFactory.createPrimaryButton("Sync Selected Tags to JPEG");
        btnSyncSingle.setPreferredSize(new Dimension(210, 36));
        btnSyncSingle.setEnabled(false);
        btnSyncSingle.addActionListener(e -> syncSelectedTags());

        btnSyncBatch = UiFactory.createSecondaryButton("Batch Sync All Pairs");
        btnSyncBatch.setPreferredSize(new Dimension(180, 36));
        btnSyncBatch.setEnabled(false);
        btnSyncBatch.addActionListener(e -> batchSyncAll());

        progressBar = UiFactory.createSlimProgressBar();
        progressBar.setPreferredSize(new Dimension(180, 8));
        statusLabel = new JLabel("Status: Select folders and click 'Find Photo Pairs' to begin.");
        statusLabel.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        statusLabel.setForeground(ThemeColors.textSecondary());

        add(createBottomActionCard(), BorderLayout.SOUTH);

        // Preload sample demo data so the UI looks alive immediately
        loadSampleDemoData();
    }

    private JPanel createHeaderCard() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new BorderLayout(12, 0));

        JPanel titleBlock = new JPanel(new GridLayout(2, 1, 0, 2));
        titleBlock.setOpaque(false);

        JLabel title = new JLabel("METASYNC — RAW & JPEG SYNCHRONIZER");
        title.setFont(new Font("Segoe UI", Font.BOLD, 14));
        title.setForeground(ThemeColors.textPrimary());
        titleBlock.add(title);

        JLabel sub = new JLabel("Pair RAW originals with exported JPEGs/XMPs, inspect tag differences, and selectively synchronize without touching raw sensor pixels.");
        sub.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        sub.setForeground(ThemeColors.textSecondary());
        titleBlock.add(sub);

        card.add(titleBlock, BorderLayout.WEST);

        JPanel badges = new JPanel(new FlowLayout(FlowLayout.RIGHT, 6, 0));
        badges.setOpaque(false);
        badges.add(UiFactory.createBadge("RAW Read-Only Guard Active", new Color(220, 252, 231), new Color(22, 101, 52)));
        badges.add(UiFactory.createBadge("ExifTool Engine Ready", ThemeColors.pillBg(), ThemeColors.textSecondary()));
        card.add(badges, BorderLayout.EAST);

        return card;
    }

    private JPanel createDirectoryAndPairsCard() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new GridBagLayout());
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.weightx = 1.0;
        gbc.gridx = 0;

        // Row 0: Dual Pickers (RAW Directory & JPEG Directory)
        JPanel pickersRow = new JPanel(new GridLayout(1, 2, 12, 0));
        pickersRow.setOpaque(false);

        // RAW Directory Box
        JPanel rawBox = UiFactory.createInnerContainer(10);
        rawBox.setLayout(new BorderLayout(8, 4));
        rawBox.setBorder(new EmptyBorder(6, 10, 6, 10));
        JLabel rawTitle = new JLabel("1. RAW SOURCE FOLDER (CR3, NEF, ARW, DNG)");
        rawTitle.setFont(new Font("Segoe UI", Font.BOLD, 10));
        rawTitle.setForeground(ThemeColors.textMuted());
        rawBox.add(rawTitle, BorderLayout.NORTH);

        JPanel rawRow = new JPanel(new BorderLayout(6, 0));
        rawRow.setOpaque(false);
        JButton btnRaw = UiFactory.createPrimaryButton("Browse RAW Folder");
        btnRaw.setPreferredSize(new Dimension(160, 28));
        btnRaw.setFont(new Font("Segoe UI", Font.BOLD, 11));
        btnRaw.addActionListener(e -> browseRawFolder());
        rawRow.add(btnRaw, BorderLayout.WEST);

        rawDirLabel.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        rawDirLabel.setForeground(ThemeColors.textMuted());
        rawDirLabel.setBorder(BorderFactory.createCompoundBorder(
                new LineBorder(ThemeColors.cardBorder(), 1, true),
                new EmptyBorder(3, 8, 3, 8)));
        rawRow.add(rawDirLabel, BorderLayout.CENTER);
        rawBox.add(rawRow, BorderLayout.CENTER);
        pickersRow.add(rawBox);

        // JPEG Directory Box
        JPanel jpegBox = UiFactory.createInnerContainer(10);
        jpegBox.setLayout(new BorderLayout(8, 4));
        jpegBox.setBorder(new EmptyBorder(6, 10, 6, 10));
        JLabel jpegTitle = new JLabel("2. JPEG / EXPORT DESTINATION FOLDER");
        jpegTitle.setFont(new Font("Segoe UI", Font.BOLD, 10));
        jpegTitle.setForeground(ThemeColors.textMuted());
        jpegBox.add(jpegTitle, BorderLayout.NORTH);

        JPanel jpegRow = new JPanel(new BorderLayout(6, 0));
        jpegRow.setOpaque(false);
        JButton btnJpeg = UiFactory.createSecondaryButton("Browse JPEG Folder");
        btnJpeg.setPreferredSize(new Dimension(160, 28));
        btnJpeg.setFont(new Font("Segoe UI", Font.BOLD, 11));
        btnJpeg.addActionListener(e -> browseJpegFolder());
        jpegRow.add(btnJpeg, BorderLayout.WEST);

        jpegDirLabel.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        jpegDirLabel.setForeground(ThemeColors.textMuted());
        jpegDirLabel.setBorder(BorderFactory.createCompoundBorder(
                new LineBorder(ThemeColors.cardBorder(), 1, true),
                new EmptyBorder(3, 8, 3, 8)));
        jpegRow.add(jpegDirLabel, BorderLayout.CENTER);
        jpegBox.add(jpegRow, BorderLayout.CENTER);
        pickersRow.add(jpegBox);

        gbc.gridy = 0;
        gbc.insets = new Insets(0, 0, 8, 0);
        card.add(pickersRow, gbc);

        // Row 1: Action row (Same Folder checkbox + Scan Button)
        JPanel actionRow = new JPanel(new BorderLayout());
        actionRow.setOpaque(false);

        sameFolderCheckbox.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        sameFolderCheckbox.setForeground(ThemeColors.textSecondary());
        sameFolderCheckbox.setOpaque(false);
        sameFolderCheckbox.addActionListener(e -> {
            if (sameFolderCheckbox.isSelected() && rawDirectory != null) {
                jpegDirectory = rawDirectory;
                jpegDirLabel.setText(rawDirectory.getAbsolutePath());
            }
        });
        actionRow.add(sameFolderCheckbox, BorderLayout.WEST);

        btnScanPairs = UiFactory.createPrimaryButton("Find Photo Pairs");
        javax.swing.Icon reloadIcon = UiFactory.svgDynamicIcon("reload", 13, () -> ThemeColors.primaryButtonText());
        if (reloadIcon != null) btnScanPairs.setIcon(reloadIcon);
        btnScanPairs.setPreferredSize(new Dimension(170, 30));
        btnScanPairs.setFont(new Font("Segoe UI", Font.BOLD, 11));
        btnScanPairs.addActionListener(e -> scanForPairs());
        actionRow.add(btnScanPairs, BorderLayout.EAST);

        gbc.gridy = 1;
        gbc.insets = new Insets(0, 0, 8, 0);
        card.add(actionRow, gbc);

        // Row 2: Discovered Pairs Table ScrollPane
        JScrollPane pairsScroll = new JScrollPane(pairsTable);
        pairsScroll.setPreferredSize(new Dimension(0, 80));
        pairsScroll.setBorder(new LineBorder(ThemeColors.cardBorder(), 1, true));

        gbc.gridy = 2;
        gbc.insets = new Insets(0, 0, 0, 0);
        card.add(pairsScroll, gbc);

        return card;
    }

    private JPanel createBottomActionCard() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new BorderLayout(12, 6));

        // Top line: Status and Progress
        JPanel statusRow = new JPanel(new BorderLayout(8, 0));
        statusRow.setOpaque(false);
        statusRow.add(statusLabel, BorderLayout.WEST);
        statusRow.add(progressBar, BorderLayout.EAST);
        card.add(statusRow, BorderLayout.NORTH);

        // Bottom line: Backup option + Action buttons
        JPanel actionRow = new JPanel(new BorderLayout());
        actionRow.setOpaque(false);

        backupCheckbox.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        backupCheckbox.setForeground(ThemeColors.textSecondary());
        backupCheckbox.setOpaque(false);
        actionRow.add(backupCheckbox, BorderLayout.WEST);

        JPanel btnGroup = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 0));
        btnGroup.setOpaque(false);
        btnGroup.add(btnSyncBatch);
        btnGroup.add(btnSyncSingle);
        actionRow.add(btnGroup, BorderLayout.EAST);

        card.add(actionRow, BorderLayout.SOUTH);
        return card;
    }

    private void browseRawFolder() {
        JFileChooser chooser = new JFileChooser();
        chooser.setDialogTitle("Select RAW Camera Original Directory");
        chooser.setFileSelectionMode(JFileChooser.DIRECTORIES_ONLY);
        if (chooser.showOpenDialog(this) == JFileChooser.APPROVE_OPTION) {
            rawDirectory = chooser.getSelectedFile();
            rawDirLabel.setText(rawDirectory.getName());
            rawDirLabel.setToolTipText(rawDirectory.getAbsolutePath());
            if (sameFolderCheckbox.isSelected()) {
                jpegDirectory = rawDirectory;
                jpegDirLabel.setText(rawDirectory.getName());
                jpegDirLabel.setToolTipText(rawDirectory.getAbsolutePath());
            }
        }
    }

    private void browseJpegFolder() {
        JFileChooser chooser = new JFileChooser();
        chooser.setDialogTitle("Select Exported JPEG / Output Directory");
        chooser.setFileSelectionMode(JFileChooser.DIRECTORIES_ONLY);
        if (chooser.showOpenDialog(this) == JFileChooser.APPROVE_OPTION) {
            jpegDirectory = chooser.getSelectedFile();
            jpegDirLabel.setText(jpegDirectory.getName());
            jpegDirLabel.setToolTipText(jpegDirectory.getAbsolutePath());
        }
    }

    private void scanForPairs() {
        if (rawDirectory == null) {
            JOptionPane.showMessageDialog(this, "Please select a RAW directory first.", "Folder Required", JOptionPane.WARNING_MESSAGE);
            return;
        }
        File targetJpeg = (jpegDirectory != null) ? jpegDirectory : rawDirectory;

        statusLabel.setText("Status: Scanning directories for matching RAW and JPEG files...");
        btnScanPairs.setEnabled(false);

        CompletableFuture.supplyAsync(() -> syncService.discoverPairs(rawDirectory, targetJpeg))
                .whenComplete((pairs, ex) -> SwingUtilities.invokeLater(() -> {
                    btnScanPairs.setEnabled(true);
                    if (ex != null) {
                        statusLabel.setText("Error discovering pairs: " + ex.getMessage());
                        return;
                    }
                    currentPairs.clear();
                    pairsTableModel.setRowCount(0);
                    if (pairs != null && !pairs.isEmpty()) {
                        currentPairs.addAll(pairs);
                        for (PhotoPair p : pairs) {
                            String rawName = p.getSourceFile() != null ? p.getSourceFile().getName() : "-";
                            String jpegName = p.getDestFile() != null ? p.getDestFile().getName() : "-";
                            String xmpName = p.getXmpSidecar() != null ? p.getXmpSidecar().getName() : "None";
                            pairsTableModel.addRow(new Object[]{rawName, jpegName, xmpName, "Ready for diff"});
                        }
                        statusLabel.setText("Found " + pairs.size() + " photo pairs. Select a pair to inspect metadata diff.");
                        btnSyncBatch.setEnabled(true);
                        pairsTable.setRowSelectionInterval(0, 0);
                    } else {
                        statusLabel.setText("No matching RAW/JPEG pairs found in the selected folders.");
                        btnSyncBatch.setEnabled(false);
                    }
                }));
    }

    private void selectPair(PhotoPair pair) {
        this.selectedPair = pair;
        diffTableModel.setRowCount(0);
        currentDifferences.clear();
        btnSyncSingle.setEnabled(false);

        if (pair == null || pair.getSourceFile() == null || pair.getDestFile() == null) {
            return;
        }

        statusLabel.setText("Status: Extracting EXIF and comparing " + pair.getSourceFile().getName() + " with " + pair.getDestFile().getName() + "...");

        CompletableFuture.runAsync(() -> syncService.analyzePair(pair))
                .whenComplete((v, ex) -> SwingUtilities.invokeLater(() -> {
                    if (ex != null) {
                        statusLabel.setText("Error analyzing pair: " + ex.getMessage());
                        return;
                    }
                    currentDifferences.addAll(pair.getDifferences());
                    for (TagDifference diff : currentDifferences) {
                        boolean defaultSelect = diff.getStatus() == DiffStatus.DIFFERENT || diff.getStatus() == DiffStatus.SOURCE_ONLY;
                        diffTableModel.addRow(new Object[]{
                                defaultSelect,
                                diff.getGroup().name(),
                                diff.getDisplayName(),
                                diff.getSourceValue() != null && !diff.getSourceValue().isEmpty() ? diff.getSourceValue() : "[Not Set]",
                                diff.getDestValue() != null && !diff.getDestValue().isEmpty() ? diff.getDestValue() : "[Not Set]",
                                diff.getStatus().name()
                        });
                    }
                    statusLabel.setText("Pair: " + pair.getSourceFile().getName() + " ➔ " + pair.getDestFile().getName() +
                            " (" + pair.getDifferences().size() + " tags inspected, " + pair.getDifferencesCount() + " differences)");
                    btnSyncSingle.setEnabled(true);
                }));
    }

    private void selectAllDifferences(boolean select) {
        for (int i = 0; i < diffTableModel.getRowCount(); i++) {
            if (select) {
                String status = String.valueOf(diffTableModel.getValueAt(i, 5));
                diffTableModel.setValueAt("DIFFERENT".equalsIgnoreCase(status) || "SOURCE_ONLY".equalsIgnoreCase(status), i, 0);
            } else {
                diffTableModel.setValueAt(false, i, 0);
            }
        }
    }

    private void syncSelectedTags() {
        if (selectedPair == null || selectedPair.getDestFile() == null) {
            JOptionPane.showMessageDialog(this, "No pair selected for synchronization.", "Selection Required", JOptionPane.WARNING_MESSAGE);
            return;
        }

        List<TagDifference> toSync = new ArrayList<>();
        for (int i = 0; i < diffTableModel.getRowCount(); i++) {
            Boolean checked = (Boolean) diffTableModel.getValueAt(i, 0);
            if (Boolean.TRUE.equals(checked) && i < currentDifferences.size()) {
                toSync.add(currentDifferences.get(i));
            }
        }

        if (toSync.isEmpty()) {
            JOptionPane.showMessageDialog(this, "No tags selected for sync. Check at least one box.", "No Tags Selected", JOptionPane.INFORMATION_MESSAGE);
            return;
        }

        statusLabel.setText("Syncing " + toSync.size() + " tags into " + selectedPair.getDestFile().getName() + "...");
        btnSyncSingle.setEnabled(false);

        boolean createBackup = backupCheckbox.isSelected();

        CompletableFuture.runAsync(() -> {
            try {
                // Ensure tag selected states are set
                for (TagDifference diff : currentDifferences) {
                    diff.setSelected(toSync.contains(diff));
                }
                metadataWriter.syncPair(selectedPair, toSync, createBackup, null);
                syncService.analyzePair(selectedPair);
            } catch (Exception ex) {
                throw new RuntimeException(ex);
            }
        }).whenComplete((v, ex) -> SwingUtilities.invokeLater(() -> {
            btnSyncSingle.setEnabled(true);
            if (ex != null) {
                Throwable cause = ex.getCause() != null ? ex.getCause() : ex;
                statusLabel.setText("Sync failed: " + cause.getMessage());
                JOptionPane.showMessageDialog(this, "Failed to synchronize tags: " + cause.getMessage(), "Sync Error", JOptionPane.ERROR_MESSAGE);
            } else {
                statusLabel.setText("Successfully synchronized " + toSync.size() + " tags into " + selectedPair.getDestFile().getName() + " (RAW original preserved intact).");
                selectPair(selectedPair);
            }
        }));
    }

    private void batchSyncAll() {
        if (currentPairs.isEmpty()) return;

        int confirm = JOptionPane.showConfirmDialog(this,
                "Batch synchronize all " + currentPairs.size() + " photo pairs?\n" +
                "This will copy all differing safe EXIF/XMP tags from RAW into each corresponding JPEG.\nRAW original files remain 100% read-only.",
                "Confirm Batch Sync", JOptionPane.YES_NO_OPTION);
        if (confirm != JOptionPane.YES_OPTION) return;

        btnSyncBatch.setEnabled(false);
        btnSyncSingle.setEnabled(false);
        progressBar.setValue(0);

        boolean createBackup = backupCheckbox.isSelected();

        MetadataSyncService.SyncListener batchListener = new MetadataSyncService.SyncListener() {
            @Override
            public void onScanProgress(int current, int total, String message) {}

            @Override
            public void onPairAnalyzed(PhotoPair pair, int index, int total) {}

            @Override
            public void onSyncProgress(int current, int total, String filename) {
                int percent = (int) (((double) current / total) * 100);
                SwingUtilities.invokeLater(() -> {
                    progressBar.setValue(percent);
                    statusLabel.setText("Batch syncing: " + current + " of " + total + " (" + filename + ")");
                });
            }

            @Override
            public void onSyncComplete(int successCount, int errorCount) {
                SwingUtilities.invokeLater(() -> {
                    progressBar.setValue(100);
                    btnSyncBatch.setEnabled(true);
                    btnSyncSingle.setEnabled(true);
                    statusLabel.setText("Batch synchronization complete! Processed: " + successCount + " success, " + errorCount + " errors.");
                    JOptionPane.showMessageDialog(MetaSyncSwingPanel.this,
                            "Batch synchronization complete!\nSuccessfully updated: " + successCount + " files\nErrors: " + errorCount,
                            "Batch Sync Finished", JOptionPane.INFORMATION_MESSAGE);
                });
            }
        };

        syncService.addListener(batchListener);

        CompletableFuture.runAsync(() -> {
            try {
                // Ensure all pairs analyzed
                for (PhotoPair p : currentPairs) {
                    if (!p.isAnalyzed()) {
                        syncService.analyzePair(p);
                    }
                }
                syncService.executeBatchSync(currentPairs, createBackup, null);
            } finally {
                syncService.removeListener(batchListener);
            }
        });
    }

    private void loadSampleDemoData() {
        pairsTableModel.addRow(new Object[]{"IMG_4210.CR3", "IMG_4210.JPG", "IMG_4210.XMP", "12 Differences"});
        pairsTableModel.addRow(new Object[]{"IMG_4211.CR3", "IMG_4211.JPG", "None", "5 Differences"});
        pairsTableModel.addRow(new Object[]{"IMG_4212.CR3", "IMG_4212_edited.JPG", "None", "8 Differences"});

        diffTableModel.addRow(new Object[]{true, "CAPTURE", "DateTimeOriginal", "2024:06:15 14:32:05", "2024:06:15 16:00:00", "DIFFERENT"});
        diffTableModel.addRow(new Object[]{true, "LOCATION", "GPSLatitude", "37.774900 N", "[Not Set]", "SOURCE_ONLY"});
        diffTableModel.addRow(new Object[]{true, "LOCATION", "GPSLongitude", "122.419400 W", "[Not Set]", "SOURCE_ONLY"});
        diffTableModel.addRow(new Object[]{true, "LOCATION", "GPSAltitude", "42.5 m", "[Not Set]", "SOURCE_ONLY"});
        diffTableModel.addRow(new Object[]{false, "CAPTURE", "CameraModel", "Canon EOS R5", "Canon EOS R5", "MATCH"});
        diffTableModel.addRow(new Object[]{false, "CAPTURE", "LensModel", "RF 24-70mm F2.8L IS USM", "RF 24-70mm F2.8L IS USM", "MATCH"});
        diffTableModel.addRow(new Object[]{true, "RATINGS", "Rating", "5", "[Not Set]", "SOURCE_ONLY"});
        diffTableModel.addRow(new Object[]{true, "COPYRIGHT", "Artist", "Rahul Jena", "[Not Set]", "SOURCE_ONLY"});
        diffTableModel.addRow(new Object[]{true, "COPYRIGHT", "Copyright", "© 2024 Rahul Jena. All Rights Reserved.", "[Not Set]", "SOURCE_ONLY"});
        diffTableModel.addRow(new Object[]{true, "KEYWORDS", "Keywords", "Portrait, Golden Hour, Studio", "[Not Set]", "SOURCE_ONLY"});
    }
}
