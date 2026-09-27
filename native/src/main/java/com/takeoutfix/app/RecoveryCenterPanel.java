package com.takeoutfix.app;

import com.takeoutfix.network.NetworkMonitorService;
import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.auth.SignInDialog;
import com.takeoutfix.dedup.DatePickerDialog;
import com.takeoutfix.restore.ConsoleCard;
import com.takeoutfix.dashboard.DashboardPanel;
import com.takeoutfix.exif.ExifViewerPanel;
import com.takeoutfix.compare.ComparisonPanel;
import com.takeoutfix.dedup.DuplicateFinderPanel;
import com.takeoutfix.shared.theme.ThemeColors;
import com.takeoutfix.shared.ui.UiFactory;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import javax.swing.border.LineBorder;
import javax.swing.filechooser.FileNameExtensionFilter;
import java.awt.*;
import java.awt.event.*;
import java.awt.datatransfer.DataFlavor;
import java.awt.dnd.DnDConstants;
import java.awt.dnd.DropTarget;
import java.awt.dnd.DropTargetDropEvent;
import java.io.File;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;

/**
 * Clean, grid-aligned Recovery Center main dashboard component.
 * Features tool switching between:
 * 1. Restore Archive (Source, Destination, Combined Options & Controls,
 * Terminal Logs)
 * 2. EXIF Viewer (Super)
 * 3. Comparison (Super)
 * 4. Duplicates (Super)
 */
public class RecoveryCenterPanel extends JPanel {

    public static final String CARD_RESTORE = "Photo Metadata Restorer";
    public static final String CARD_DASHBOARD = "Operations Dashboard";
    public static final String CARD_EXIF = "EXIF Viewer (BETA)";
    public static final String CARD_COMPARE = "Archive Compare (BETA)";
    public static final String CARD_DUPLICATE = "Duplicate Finder (BETA)";
    public static final String CARD_AUTH_REQUIRED = "Sign In Required";
    public static final String CARD_UPGRADE_REQUIRED = "Upgrade Plan Required";
    public static final String CARD_AUTHENTICATING = "Authenticating Session";

    private final CardLayout cardLayout = new CardLayout();
    private final JPanel centerCards = new JPanel(cardLayout);
    private String currentCard = CARD_RESTORE;

    // Soft-Lock Card Components
    private JLabel upgradeRequiredBadge;
    private JLabel upgradeRequiredTitle;
    private JLabel upgradeRequiredDesc;
    private String pendingUpgradeFeature = null;

    // Header labels & Tool Switcher Dropdown
    private JPanel headerRow;
    private final JLabel mainTitle = new JLabel("RECOVERY OPS CENTER");
    private final JLabel subtitle = new JLabel(
            "Select Takeout archive source, choose destination folder, and restore metadata.");
    private JComboBox<String> moduleSelect;
    private boolean updatingModuleSelect = false;

    // Inputs & Selection
    private String selectedSourcePath = "";
    private String selectedOutputPath = "";
    private final JLabel sourcePathLabel = new JLabel("No folder or ZIP archive selected yet", SwingConstants.CENTER);
    private final JLabel outputPathLabel = new JLabel("No destination folder selected yet", SwingConstants.CENTER);
    private final JButton btnSourceClear = UiFactory.createSecondaryButton("✕");
    private final JButton btnDestClear = UiFactory.createSecondaryButton("✕");

    // Options
    private final JTextField dateOverrideField = UiFactory.createTextField("YYYY-MM-DD");
    private final JButton btnDatePicker = UiFactory.createIconButton("calendar", "📅", "Pick a date");
    private final JCheckBox organizeYearMonthCheckbox = new JCheckBox("Organize into Month subfolders", false);
    private final JCheckBox splitVolumesCheckbox = new JCheckBox("Compress output into 2GB ZIP volumes");
    private final JCheckBox smartInterpolationCheckbox = new JCheckBox("Smart Timestamp Interpolation", true);
    private final JCheckBox powerKeepAwakeCheckbox = new JCheckBox("Keep System Awake while processing", true);

    // Controls & Status
    private final JButton btnStart;
    private final JButton btnPause;
    private final JButton btnCancel;
    private final JButton btnOpenFolder;
    private boolean isCurrentlyRunning = false;
    private boolean isCurrentlyPaused = false;

    private final JLabel progressStatusLabel = new JLabel("Status: Ready - Select source and destination to begin.");
    private final JProgressBar progressBar = UiFactory.createSlimProgressBar();
    private final JLabel progressPercentLabel = new JLabel("0%");

    private final JLabel elapsedLabel = new JLabel("⏱ Elapsed: 00:00");
    private final JLabel speedLabel = new JLabel("Speed: 0.0 files/s • 0.0 MB/s");
    private final JLabel etaLabel = new JLabel("⏳ ETA: --:--");

    // Logs
    private final ConsoleCard consoleCard = new ConsoleCard();

    private final Component parentFrame;
    private final NetworkMonitorService netService;
    private final UserSyncBridgeService userService;
    private final com.takeoutfix.ads.AdSyncService adSyncService;

    // Sub-tool panels
    private final DashboardPanel dashboardPanel;
    private final ExifViewerPanel exifViewerPanel;
    private final ComparisonPanel comparisonPanel;
    private final DuplicateFinderPanel duplicateFinderPanel;

    private Runnable onStartCallback;
    private Runnable onPauseCallback;
    private Runnable onCancelCallback;
    private Runnable onOpenFolderCallback;

    private Consumer<String> onCardChange = null;
    private String lastLoggedEmail = null;

    public void setOnCardChangeListener(Consumer<String> listener) {
        this.onCardChange = listener;
    }

    public com.takeoutfix.ads.AdSyncService getAdSyncService() {
        return adSyncService;
    }

    public RecoveryCenterPanel(Component parentFrame, NetworkMonitorService netService,
            UserSyncBridgeService userService) {
        this(parentFrame, netService, userService, null);
    }

    public RecoveryCenterPanel(Component parentFrame, NetworkMonitorService netService,
            UserSyncBridgeService userService, com.takeoutfix.ads.AdSyncService adSyncService) {
        this.parentFrame = parentFrame;
        this.netService = netService;
        this.userService = userService;
        this.adSyncService = adSyncService;

        setLayout(new BorderLayout(0, 10));
        setBorder(new EmptyBorder(16, 16, 16, 16));

        Runnable updateTheme = () -> {
            setBackground(ThemeColors.canvasBg());
            repaint();
        };
        updateTheme.run();
        ThemeColors.addThemeListener(updateTheme);

        btnStart = UiFactory.createPrimaryButton("Start Restoration");
        btnStart.setPreferredSize(new Dimension(170, 36));

        btnPause = createCustomActionButton("Pause");
        btnPause.setPreferredSize(new Dimension(100, 36));
        btnPause.setEnabled(false);
        btnPause.addMouseListener(new MouseAdapter() {
            @Override public void mouseEntered(MouseEvent e) {
                if (!btnPause.isEnabled()) return;
                boolean dark = ThemeColors.isDark();
                if (isCurrentlyPaused) {
                    btnPause.setBackground(dark ? new Color(30, 64, 175) : new Color(219, 234, 254));
                } else {
                    btnPause.setBackground(dark ? new Color(120, 53, 15) : new Color(253, 230, 138));
                }
            }
            @Override public void mouseExited(MouseEvent e) {
                if (btnPause.isEnabled()) {
                    updateActionButtonColors(isCurrentlyRunning, isCurrentlyPaused);
                }
            }
        });

        btnCancel = createCustomActionButton("Cancel");
        btnCancel.setPreferredSize(new Dimension(100, 36));
        btnCancel.setEnabled(false);
        btnCancel.addMouseListener(new MouseAdapter() {
            @Override public void mouseEntered(MouseEvent e) {
                if (!btnCancel.isEnabled()) return;
                boolean dark = ThemeColors.isDark();
                btnCancel.setBackground(dark ? new Color(127, 29, 29) : new Color(254, 226, 226));
            }
            @Override public void mouseExited(MouseEvent e) {
                if (btnCancel.isEnabled()) {
                    updateActionButtonColors(isCurrentlyRunning, isCurrentlyPaused);
                }
            }
        });

        updateActionButtonColors(false, false);
        ThemeColors.addThemeListener(() -> updateActionButtonColors(isCurrentlyRunning, isCurrentlyPaused));

        btnOpenFolder = UiFactory.createSecondaryButton("Open Output Folder");
        javax.swing.Icon folderOutIcon = UiFactory.svgDynamicIcon("output-folder", 15,
                () -> ThemeColors.secondaryButtonText());
        if (folderOutIcon != null)
            btnOpenFolder.setIcon(folderOutIcon);
        btnOpenFolder.setPreferredSize(new Dimension(170, 36));

        // Instantiate sub-tool panels
        dashboardPanel = new DashboardPanel(userService, netService, adSyncService, this::switchTo);
        exifViewerPanel = new ExifViewerPanel(userService);
        comparisonPanel = new ComparisonPanel(userService);
        duplicateFinderPanel = new DuplicateFinderPanel(userService);

        // Header Row (title and description)
        headerRow = createHeaderRow();
        headerRow.setVisible(false);
        add(headerRow, BorderLayout.NORTH);

        // Center Cards (all tools completely free and unlocked in Beta)
        centerCards.setOpaque(false);
        centerCards.add(createAuthenticatingCard(), CARD_AUTHENTICATING);
        centerCards.add(dashboardPanel, CARD_DASHBOARD);
        centerCards.add(createRestoreDashboardCard(), CARD_RESTORE);
        centerCards.add(exifViewerPanel, CARD_EXIF);
        centerCards.add(comparisonPanel, CARD_COMPARE);
        centerCards.add(duplicateFinderPanel, CARD_DUPLICATE);
        centerCards.add(createAuthRequiredCard(), CARD_AUTH_REQUIRED);
        centerCards.add(createUpgradeRequiredCard(), CARD_UPGRADE_REQUIRED);
        add(centerCards, BorderLayout.CENTER);

        wireActions();

        // IDE-style silent startup authentication
        cardLayout.show(centerCards, CARD_AUTHENTICATING);
        userService.verifyStartupSession(authenticated -> {
            updatePlanBadge();
            switchTo(CARD_RESTORE);
            if (authenticated) {
                lastLoggedEmail = userService.getCurrentEmail();
                consoleCard.appendLog("SUCCESS", "Session validated: " + lastLoggedEmail + " • Cloud sync active.");
            } else {
                consoleCard.appendLog("INFO",
                        "Running in Guest mode. Sign in with Google to enable cloud sync.");
            }
        });
    }

    private JPanel createRestoreDashboardCard() {
        JPanel panel = new JPanel(new GridBagLayout());
        panel.setOpaque(false);
        int gridY = 0;

        // 1. Unified 2-Column Restore Workspace (60/40 Split: Operations Pipeline |
        // Controls & Options)
        panel.add(createUnifiedRestoreWorkspaceCard(),
                createConstraints(gridY++, 0.0, GridBagConstraints.HORIZONTAL, 10));

        // 2. Logs Terminal — consumes ALL remaining vertical space
        GridBagConstraints logsGbc = new GridBagConstraints();
        logsGbc.gridx = 0;
        logsGbc.gridy = gridY++;
        logsGbc.weightx = 1.0;
        logsGbc.weighty = 1.0;
        logsGbc.fill = GridBagConstraints.BOTH;
        logsGbc.anchor = GridBagConstraints.CENTER;
        logsGbc.insets = new Insets(0, 0, 0, 0);
        panel.add(consoleCard, logsGbc);

        return panel;
    }

    /**
     * Unified 2-column workspace layout matching the user's Excalidraw design:
     * - Left column (60% width): Operations Pipeline
     * 1. Source selection (Browse Folder, ZIP File, Path display, Clear)
     * 2. Destination selection (Select Destination Folder, Path display, Clear)
     * 3. Action buttons (Start, Pause, Cancel, Open Output Folder)
     * 4. Live Progress & Telemetry (Status, %, Progress bar, Elapsed, Speed, ETA)
     * - Right column (40% width): Controls & Options
     * - Fallback Date picker
     * - 4 vertically stacked restoration checkboxes
     */
    private JPanel createUnifiedRestoreWorkspaceCard() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new GridBagLayout());
        card.setBorder(new EmptyBorder(12, 14, 12, 14));

        GridBagConstraints gbc = new GridBagConstraints();
        gbc.fill = GridBagConstraints.BOTH;
        gbc.gridy = 0;

        // ── Left Column: Operations Pipeline (60% Width) ─────────────────────
        JPanel leftCol = new JPanel(new GridBagLayout());
        leftCol.setOpaque(false);
        GridBagConstraints l = new GridBagConstraints();
        l.gridx = 0;
        l.fill = GridBagConstraints.HORIZONTAL;
        l.weightx = 1.0;

        // 1. Source Inner Box
        JPanel srcBox = UiFactory.createInnerContainer(12);
        srcBox.setLayout(new BorderLayout(8, 6));
        srcBox.setBorder(new EmptyBorder(8, 12, 8, 12));

        JLabel srcTitle = new JLabel("1. TAKEOUT ARCHIVE SOURCE");
        srcTitle.setFont(new Font("Segoe UI", Font.BOLD, 10));
        srcTitle.setForeground(ThemeColors.textMuted());
        srcBox.add(srcTitle, BorderLayout.NORTH);

        JPanel srcBody = new JPanel(new BorderLayout(8, 0));
        srcBody.setOpaque(false);

        JPanel srcBtns = new JPanel(new FlowLayout(FlowLayout.LEFT, 6, 0));
        srcBtns.setOpaque(false);
        JButton btnFolder = UiFactory.createPrimaryButton("Browse Folder");
        javax.swing.Icon folderIcon = UiFactory.svgDynamicIcon("folder", 14, () -> ThemeColors.primaryButtonText());
        if (folderIcon != null)
            btnFolder.setIcon(folderIcon);
        btnFolder.setPreferredSize(new Dimension(135, 30));
        btnFolder.setFont(new Font("Segoe UI", Font.BOLD, 11));
        btnFolder.setToolTipText("Select extracted Takeout directory");
        btnFolder.addActionListener(e -> browseSourceFolder());
        srcBtns.add(btnFolder);

        JButton btnZip = UiFactory.createSecondaryButton("ZIP File");
        javax.swing.Icon zipIcon = UiFactory.svgDynamicIcon("zip", 14, () -> ThemeColors.secondaryButtonText());
        if (zipIcon != null)
            btnZip.setIcon(zipIcon);
        btnZip.setPreferredSize(new Dimension(95, 30));
        btnZip.setFont(new Font("Segoe UI", Font.BOLD, 11));
        btnZip.setToolTipText("Select Google Takeout .zip archive");
        btnZip.addActionListener(e -> browseSourceZip());
        srcBtns.add(btnZip);
        srcBody.add(srcBtns, BorderLayout.WEST);

        JPanel srcPathRow = new JPanel(new BorderLayout(4, 0));
        srcPathRow.setOpaque(false);
        sourcePathLabel.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        sourcePathLabel.setForeground(ThemeColors.textMuted());
        sourcePathLabel.setBorder(BorderFactory.createCompoundBorder(
                new javax.swing.border.LineBorder(ThemeColors.cardBorder(), 1, true),
                new EmptyBorder(4, 10, 4, 10)));
        srcPathRow.add(sourcePathLabel, BorderLayout.CENTER);

        btnSourceClear.setFont(new Font("Segoe UI", Font.BOLD, 10));
        btnSourceClear.setPreferredSize(new Dimension(28, 28));
        btnSourceClear.setToolTipText("Clear source");
        btnSourceClear.setVisible(false);
        btnSourceClear.addActionListener(e -> clearSource());
        srcPathRow.add(btnSourceClear, BorderLayout.EAST);
        srcBody.add(srcPathRow, BorderLayout.CENTER);
        srcBox.add(srcBody, BorderLayout.CENTER);

        // Drag & drop on source box
        if (!GraphicsEnvironment.isHeadless()) {
            srcBox.setDropTarget(new java.awt.dnd.DropTarget() {
                @Override
                public synchronized void drop(java.awt.dnd.DropTargetDropEvent evt) {
                    try {
                        evt.acceptDrop(java.awt.dnd.DnDConstants.ACTION_COPY);
                        @SuppressWarnings("unchecked")
                        List<File> files = (List<File>) evt.getTransferable()
                                .getTransferData(java.awt.datatransfer.DataFlavor.javaFileListFlavor);
                        if (files != null && !files.isEmpty())
                            setSourceFile(files.get(0));
                    } catch (Exception ignored) {
                    }
                }
            });
        }

        l.gridy = 0;
        l.insets = new Insets(0, 0, 6, 0);
        leftCol.add(srcBox, l);

        // 2. Destination Inner Box
        JPanel dstBox = UiFactory.createInnerContainer(12);
        dstBox.setLayout(new BorderLayout(8, 6));
        dstBox.setBorder(new EmptyBorder(8, 12, 8, 12));

        JLabel dstTitle = new JLabel("2. OUTPUT DESTINATION FOLDER");
        dstTitle.setFont(new Font("Segoe UI", Font.BOLD, 10));
        dstTitle.setForeground(ThemeColors.textMuted());
        dstBox.add(dstTitle, BorderLayout.NORTH);

        JPanel dstBody = new JPanel(new BorderLayout(8, 0));
        dstBody.setOpaque(false);

        JButton btnDest = UiFactory.createSecondaryButton("Select Destination Folder");
        javax.swing.Icon destIcon = UiFactory.svgDynamicIcon("folder", 14, () -> ThemeColors.secondaryButtonText());
        if (destIcon != null)
            btnDest.setIcon(destIcon);
        btnDest.setPreferredSize(new Dimension(195, 30));
        btnDest.setFont(new Font("Segoe UI", Font.BOLD, 11));
        btnDest.setToolTipText("Select folder where restored photos will be saved");
        btnDest.addActionListener(e -> browseDestinationFolder());
        dstBody.add(btnDest, BorderLayout.WEST);

        JPanel dstPathRow = new JPanel(new BorderLayout(4, 0));
        dstPathRow.setOpaque(false);
        outputPathLabel.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        outputPathLabel.setForeground(ThemeColors.textMuted());
        outputPathLabel.setBorder(BorderFactory.createCompoundBorder(
                new javax.swing.border.LineBorder(ThemeColors.cardBorder(), 1, true),
                new EmptyBorder(4, 10, 4, 10)));
        dstPathRow.add(outputPathLabel, BorderLayout.CENTER);

        btnDestClear.setFont(new Font("Segoe UI", Font.BOLD, 10));
        btnDestClear.setPreferredSize(new Dimension(28, 28));
        btnDestClear.setToolTipText("Clear destination");
        btnDestClear.setVisible(false);
        btnDestClear.addActionListener(e -> clearDestination());
        dstPathRow.add(btnDestClear, BorderLayout.EAST);
        dstBody.add(dstPathRow, BorderLayout.CENTER);
        dstBox.add(dstBody, BorderLayout.CENTER);

        // Drag & drop on destination box
        if (!GraphicsEnvironment.isHeadless()) {
            dstBox.setDropTarget(new java.awt.dnd.DropTarget() {
                @Override
                public synchronized void drop(java.awt.dnd.DropTargetDropEvent evt) {
                    try {
                        evt.acceptDrop(java.awt.dnd.DnDConstants.ACTION_COPY);
                        @SuppressWarnings("unchecked")
                        List<File> files = (List<File>) evt.getTransferable()
                                .getTransferData(java.awt.datatransfer.DataFlavor.javaFileListFlavor);
                        if (files != null && !files.isEmpty()) {
                            File f = files.get(0);
                            setDestinationFile(f.isDirectory() ? f : f.getParentFile());
                        }
                    } catch (Exception ignored) {
                    }
                }
            });
        }

        l.gridy = 1;
        l.insets = new Insets(0, 0, 6, 0);
        leftCol.add(dstBox, l);

        // 3. Action Buttons Inner Box — adapts dynamically across the full card width
        JPanel actBox = UiFactory.createInnerContainer(12);
        actBox.setLayout(new GridBagLayout());
        actBox.setBorder(new EmptyBorder(6, 10, 6, 10));

        GridBagConstraints abGbc = new GridBagConstraints();
        abGbc.fill = GridBagConstraints.BOTH;
        abGbc.gridy = 0;
        abGbc.insets = new Insets(0, 0, 0, 8);

        // Start (prominent primary action)
        abGbc.gridx = 0;
        abGbc.weightx = 0.36;
        btnStart.setPreferredSize(new Dimension(0, 34));
        actBox.add(btnStart, abGbc);

        // Pause
        abGbc.gridx = 1;
        abGbc.weightx = 0.14;
        btnPause.setPreferredSize(new Dimension(0, 34));
        actBox.add(btnPause, abGbc);

        // Cancel
        abGbc.gridx = 2;
        abGbc.weightx = 0.14;
        btnCancel.setPreferredSize(new Dimension(0, 34));
        actBox.add(btnCancel, abGbc);

        // Open Output Folder
        abGbc.gridx = 3;
        abGbc.weightx = 0.36;
        abGbc.insets = new Insets(0, 0, 0, 0);
        btnOpenFolder.setPreferredSize(new Dimension(0, 34));
        actBox.add(btnOpenFolder, abGbc);

        l.gridy = 2;
        l.insets = new Insets(0, 0, 6, 0);
        leftCol.add(actBox, l);

        // 4. Progress & Telemetry Inner Box
        JPanel progBox = UiFactory.createInnerContainer(12);
        progBox.setLayout(new GridBagLayout());
        progBox.setBorder(new EmptyBorder(8, 12, 8, 12));

        GridBagConstraints p = new GridBagConstraints();
        p.gridx = 0;
        p.fill = GridBagConstraints.HORIZONTAL;
        p.weightx = 1.0;

        // Status + Percent
        JPanel statusRow = new JPanel(new BorderLayout());
        statusRow.setOpaque(false);
        progressStatusLabel.setFont(new Font("Segoe UI", Font.BOLD, 11));
        progressStatusLabel.setForeground(ThemeColors.textPrimary());
        statusRow.add(progressStatusLabel, BorderLayout.WEST);
        progressPercentLabel.setFont(new Font("Segoe UI", Font.BOLD, 12));
        progressPercentLabel.setForeground(ThemeColors.accent());
        statusRow.add(progressPercentLabel, BorderLayout.EAST);
        p.gridy = 0;
        p.insets = new Insets(0, 0, 4, 0);
        progBox.add(statusRow, p);

        // Progress Bar
        p.gridy = 1;
        p.insets = new Insets(0, 0, 4, 0);
        progBox.add(progressBar, p);

        // Telemetry Row: Elapsed | Speed | ETA
        JPanel telemetryRow = new JPanel(new BorderLayout());
        telemetryRow.setOpaque(false);
        elapsedLabel.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        elapsedLabel.setForeground(ThemeColors.textSecondary());
        telemetryRow.add(elapsedLabel, BorderLayout.WEST);
        speedLabel.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        speedLabel.setForeground(ThemeColors.textSecondary());
        speedLabel.setHorizontalAlignment(SwingConstants.CENTER);
        telemetryRow.add(speedLabel, BorderLayout.CENTER);
        etaLabel.setFont(new Font("Segoe UI", Font.BOLD, 11));
        etaLabel.setForeground(ThemeColors.accent());
        telemetryRow.add(etaLabel, BorderLayout.EAST);
        p.gridy = 2;
        p.insets = new Insets(0, 0, 0, 0);
        progBox.add(telemetryRow, p);

        l.gridy = 3;
        l.insets = new Insets(0, 0, 0, 0);
        leftCol.add(progBox, l);

        // ── Right Column: Controls & Options (25% Width - Compact & Snug) ─────
        JPanel rightCol = UiFactory.createInnerContainer(12);
        rightCol.setLayout(new GridBagLayout());
        rightCol.setBorder(new EmptyBorder(8, 12, 8, 12));

        GridBagConstraints r = new GridBagConstraints();
        r.gridx = 0;
        r.fill = GridBagConstraints.HORIZONTAL;
        r.weightx = 1.0;

        // Title
        JPanel headRow = new JPanel(new BorderLayout());
        headRow.setOpaque(false);
        JLabel ctrlTitle = new JLabel("RESTORATION CONTROLS");
        ctrlTitle.setFont(new Font("Segoe UI", Font.BOLD, 10));
        ctrlTitle.setForeground(ThemeColors.textMuted());
        headRow.add(ctrlTitle, BorderLayout.WEST);
        JLabel optBadge = UiFactory.createBadge("OPTIONS", ThemeColors.pillBg(), ThemeColors.textSecondary());
        headRow.add(optBadge, BorderLayout.EAST);
        r.gridy = 0;
        r.insets = new Insets(0, 0, 6, 0);
        rightCol.add(headRow, r);

        // Date input row (compact, snug)
        JPanel dateBlock = new JPanel();
        dateBlock.setLayout(new BoxLayout(dateBlock, BoxLayout.Y_AXIS));
        dateBlock.setOpaque(false);

        JLabel dateLbl = new JLabel("Fallback Date (missing timestamps)");
        dateLbl.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        dateLbl.setForeground(ThemeColors.textSecondary());
        dateLbl.setAlignmentX(Component.LEFT_ALIGNMENT);
        dateBlock.add(dateLbl);
        dateBlock.add(Box.createVerticalStrut(3));

        JPanel dateRow = new JPanel(new FlowLayout(FlowLayout.LEFT, 0, 0));
        dateRow.setOpaque(false);
        dateRow.setAlignmentX(Component.LEFT_ALIGNMENT);
        dateOverrideField.setPreferredSize(new Dimension(115, 28));
        dateOverrideField.setMaximumSize(new Dimension(115, 28));
        btnDatePicker.setPreferredSize(new Dimension(28, 28));
        dateRow.add(dateOverrideField);
        dateRow.add(Box.createHorizontalStrut(5));
        dateRow.add(btnDatePicker);

        btnDatePicker.addActionListener(e -> {
            DatePickerDialog dp = new DatePickerDialog(this, dateOverrideField.getText(), dateOverrideField::setText);
            dp.setVisible(true);
        });

        dateBlock.add(dateRow);

        r.gridy = 1;
        r.insets = new Insets(0, 0, 8, 0);
        rightCol.add(dateBlock, r);

        // Checkboxes in a compact vertical stack (4 rows)
        JPanel cbCol = new JPanel(new GridLayout(4, 1, 0, 4));
        cbCol.setOpaque(false);
        styleCheckbox(organizeYearMonthCheckbox);
        styleCheckbox(smartInterpolationCheckbox);
        styleCheckbox(powerKeepAwakeCheckbox);
        styleCheckbox(splitVolumesCheckbox);
        organizeYearMonthCheckbox.setToolTipText("Organize into Month subfolders (Album/MM - Month)");
        smartInterpolationCheckbox.setToolTipText("Infer missing timestamps using adjacent photo chronologies");
        powerKeepAwakeCheckbox.setToolTipText("Prevent PC from entering sleep mode while restoration is active");
        splitVolumesCheckbox.setToolTipText("Automatically split destination into 2GB ZIP archive volumes");
        cbCol.add(organizeYearMonthCheckbox);
        cbCol.add(smartInterpolationCheckbox);
        cbCol.add(powerKeepAwakeCheckbox);
        cbCol.add(splitVolumesCheckbox);

        r.gridy = 2;
        r.insets = new Insets(0, 0, 0, 0);
        rightCol.add(cbCol, r);

        // ── Combine Left (75%) & Right (25%) Columns into card ────────────────
        gbc.gridx = 0;
        gbc.weightx = 0.75;
        gbc.insets = new Insets(0, 0, 0, 10);
        card.add(leftCol, gbc);

        gbc.gridx = 1;
        gbc.weightx = 0.25;
        gbc.insets = new Insets(0, 0, 0, 0);
        card.add(rightCol, gbc);

        ThemeColors.addThemeListener(() -> {
            srcTitle.setForeground(ThemeColors.textMuted());
            dstTitle.setForeground(ThemeColors.textMuted());
            ctrlTitle.setForeground(ThemeColors.textMuted());
            dateLbl.setForeground(ThemeColors.textSecondary());
            sourcePathLabel
                    .setForeground(selectedSourcePath.isEmpty() ? ThemeColors.textMuted() : ThemeColors.textPrimary());
            outputPathLabel
                    .setForeground(selectedOutputPath.isEmpty() ? ThemeColors.textMuted() : ThemeColors.textPrimary());
            sourcePathLabel.setBorder(BorderFactory.createCompoundBorder(
                    new javax.swing.border.LineBorder(ThemeColors.cardBorder(), 1, true),
                    new EmptyBorder(4, 10, 4, 10)));
            outputPathLabel.setBorder(BorderFactory.createCompoundBorder(
                    new javax.swing.border.LineBorder(ThemeColors.cardBorder(), 1, true),
                    new EmptyBorder(4, 10, 4, 10)));
            progressStatusLabel.setForeground(ThemeColors.textPrimary());
            progressPercentLabel.setForeground(ThemeColors.accent());
            elapsedLabel.setForeground(ThemeColors.textSecondary());
            speedLabel.setForeground(ThemeColors.textSecondary());
            etaLabel.setForeground(ThemeColors.accent());
            styleCheckbox(organizeYearMonthCheckbox);
            styleCheckbox(smartInterpolationCheckbox);
            styleCheckbox(powerKeepAwakeCheckbox);
            styleCheckbox(splitVolumesCheckbox);
        });

        return card;
    }

    // Side-by-side container for Source and Destination panels
    public JPanel createSourceAndDestinationPanel() {
        JPanel splitPanel = new JPanel(new GridLayout(1, 2, 14, 0));
        splitPanel.setOpaque(false);
        splitPanel.add(createSourcePanel());
        splitPanel.add(createDestinationPanel());
        return splitPanel;
    }

    private GridBagConstraints createConstraints(int row, double weighty, int fill, int bottomMargin) {
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.gridx = 0;
        gbc.gridy = row;
        gbc.weightx = 1.0;
        gbc.weighty = weighty;
        gbc.fill = fill;
        gbc.anchor = GridBagConstraints.NORTH;
        gbc.insets = new Insets(0, 0, bottomMargin, 0);
        return gbc;
    }

    // A. Header Row (Tool Switcher Dropdown as shown in Screenshot 5)
    private JPanel createHeaderRow() {
        JPanel row = new JPanel(new BorderLayout(16, 0));
        row.setOpaque(false);

        JPanel titleBlock = new JPanel(new GridLayout(2, 1, 0, 2));
        titleBlock.setOpaque(false);

        mainTitle.setFont(new Font("Segoe UI", Font.BOLD, 15));
        mainTitle.setForeground(ThemeColors.textPrimary());
        titleBlock.add(mainTitle);

        subtitle.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        subtitle.setForeground(ThemeColors.textSecondary());
        titleBlock.add(subtitle);

        row.add(titleBlock, BorderLayout.WEST);

        // Tool Switcher Dropdown on EAST
        String[] tools = {
                CARD_RESTORE,
                CARD_DASHBOARD,
                CARD_EXIF,
                CARD_COMPARE,
                CARD_DUPLICATE
        };
        moduleSelect = new JComboBox<>(tools);
        moduleSelect.setFont(new Font("Segoe UI", Font.BOLD, 12));
        moduleSelect.setPreferredSize(new Dimension(240, 34));
        moduleSelect.setSelectedItem(CARD_RESTORE);
        moduleSelect.setFocusable(false);
        moduleSelect.setLightWeightPopupEnabled(true);
        moduleSelect.putClientProperty("JComboBox.isPopDown", true);

        // Auto-close popup when switching applications or window loses focus on
        // Linux/X11
        KeyboardFocusManager.getCurrentKeyboardFocusManager().addPropertyChangeListener(evt -> {
            String prop = evt.getPropertyName();
            if ("focusedWindow".equals(prop) || "activeWindow".equals(prop)) {
                if (evt.getNewValue() == null) {
                    SwingUtilities.invokeLater(() -> closeOpenPopups());
                }
            }
        });

        try {
            Toolkit.getDefaultToolkit().addAWTEventListener(event -> {
                int id = event.getID();
                if (id == WindowEvent.WINDOW_LOST_FOCUS || id == WindowEvent.WINDOW_DEACTIVATED
                        || id == WindowEvent.WINDOW_ICONIFIED) {
                    SwingUtilities.invokeLater(() -> closeOpenPopups());
                }
            }, AWTEvent.WINDOW_EVENT_MASK | AWTEvent.WINDOW_FOCUS_EVENT_MASK);
        } catch (SecurityException ignored) {
        }

        moduleSelect.addHierarchyListener(e -> {
            if ((e.getChangeFlags() & HierarchyEvent.SHOWING_CHANGED) != 0 && moduleSelect.isShowing()) {
                Window win = SwingUtilities.getWindowAncestor(moduleSelect);
                if (win != null) {
                    win.addWindowFocusListener(new WindowAdapter() {
                        @Override
                        public void windowLostFocus(WindowEvent we) {
                            closeOpenPopups();
                        }

                        @Override
                        public void windowDeactivated(WindowEvent we) {
                            closeOpenPopups();
                        }

                        @Override
                        public void windowIconified(WindowEvent we) {
                            closeOpenPopups();
                        }
                    });
                    win.addComponentListener(new ComponentAdapter() {
                        @Override
                        public void componentMoved(ComponentEvent ce) {
                            closeOpenPopups();
                        }

                        @Override
                        public void componentResized(ComponentEvent ce) {
                            closeOpenPopups();
                        }
                    });
                }
            }
        });

        moduleSelect.addActionListener(e -> {
            if (updatingModuleSelect)
                return;
            String selected = (String) moduleSelect.getSelectedItem();
            if (selected != null && !selected.equals(currentCard)) {
                switchTo(selected);
            }
        });

        JPanel rightBox = new JPanel(new FlowLayout(FlowLayout.RIGHT, 0, 0));
        rightBox.setOpaque(false);
        rightBox.add(moduleSelect);
        row.add(rightBox, BorderLayout.EAST);

        ThemeColors.addThemeListener(() -> {
            mainTitle.setForeground(ThemeColors.textPrimary());
            subtitle.setForeground(ThemeColors.textSecondary());
        });

        return row;
    }

    private JPanel createAuthRequiredCard() {
        JPanel card = UiFactory.createGlassCard(18, new EmptyBorder(32, 40, 32, 40));
        card.setLayout(new GridBagLayout());

        GridBagConstraints gbc = new GridBagConstraints();
        gbc.gridx = 0;
        gbc.gridy = 0;
        gbc.insets = new Insets(0, 0, 14, 0);

        JLabel lockLabel = UiFactory.createBadge("LOGIN REQUIRED", new Color(254, 243, 199), new Color(217, 119, 6));
        lockLabel.setFont(new Font("Segoe UI", Font.BOLD, 11));
        card.add(lockLabel, gbc);

        gbc.gridy = 1;
        gbc.insets = new Insets(0, 0, 6, 0);
        JLabel title = new JLabel("Google Sign-In Required");
        title.setFont(new Font("Segoe UI", Font.BOLD, 20));
        title.setForeground(ThemeColors.textPrimary());
        card.add(title, gbc);

        gbc.gridy = 2;
        gbc.insets = new Insets(0, 20, 16, 20);
        JLabel desc = new JLabel(
                "<html><center style='width: 420px; font-size: 12px; color: #888888; line-height: 1.5;'>"
                        + "Sign in with your Google account to unlock TakeoutFix restoration engines, EXIF timestamp matching, and multi-archive deduplication."
                        + "</center></html>",
                SwingConstants.CENTER);
        card.add(desc, gbc);

        // Feature benefits row
        gbc.gridy = 3;
        gbc.insets = new Insets(0, 0, 24, 0);
        JPanel featsRow = new JPanel(new FlowLayout(FlowLayout.CENTER, 8, 0));
        featsRow.setOpaque(false);
        featsRow.add(UiFactory.createBadge("Full Access Unlocked", ThemeColors.pillBg(), ThemeColors.textSecondary()));
        featsRow.add(UiFactory.createBadge("Lossless EXIF Fixes", ThemeColors.pillBg(), ThemeColors.textSecondary()));
        featsRow.add(UiFactory.createBadge("Cloud History Sync", ThemeColors.pillBg(), ThemeColors.textSecondary()));
        card.add(featsRow, gbc);

        // Buttons row: Sign in + Return to Dashboard
        gbc.gridy = 4;
        gbc.insets = new Insets(0, 0, 0, 0);
        JPanel btnRow = new JPanel(new FlowLayout(FlowLayout.CENTER, 10, 0));
        btnRow.setOpaque(false);

        JButton btnReturnRestorer = UiFactory.createSecondaryButton("← Back to Restorer");
        btnReturnRestorer.setPreferredSize(new Dimension(170, 38));
        btnReturnRestorer.addActionListener(e -> switchTo(CARD_RESTORE));
        btnRow.add(btnReturnRestorer);

        JButton btnGoogle = UiFactory.createPrimaryButton("Sign In with Google");
        btnGoogle.setPreferredSize(new Dimension(180, 38));
        btnGoogle.addActionListener(e -> {
            btnGoogle.setEnabled(false);
            btnGoogle.setText("Signing in...");
            userService.getGoogleAuthService().authenticate().whenComplete((session, error) -> SwingUtilities.invokeLater(() -> {
                btnGoogle.setEnabled(true);
                btnGoogle.setText("Sign In with Google");
                if (error != null) {
                    JOptionPane.showMessageDialog(this,
                            "Google Sign-In was cancelled or failed:\n" + error.getMessage(),
                            "Sign-In Error", JOptionPane.ERROR_MESSAGE);
                } else if (session != null && session.isAuthenticated()) {
                    com.takeoutfix.auth.UserController.syncUser(session.toMap());
                    userService.triggerCloudSync(null);
                    updatePlanBadge();
                    switchTo(CARD_RESTORE);
                }
            }));
        });
        btnRow.add(btnGoogle);
        card.add(btnRow, gbc);

        ThemeColors.addThemeListener(() -> {
            title.setForeground(ThemeColors.textPrimary());
        });

        return card;
    }

    private JPanel createUpgradeRequiredCard() {
        JPanel card = UiFactory.createGlassCard(18, new EmptyBorder(32, 40, 32, 40));
        card.setLayout(new GridBagLayout());

        GridBagConstraints gbc = new GridBagConstraints();
        gbc.gridx = 0;
        gbc.gridy = 0;
        gbc.insets = new Insets(0, 0, 14, 0);

        upgradeRequiredBadge = UiFactory.createBadge("PRO / SUPER TIER REQUIRED", new Color(243, 232, 255),
                new Color(147, 51, 234));
        upgradeRequiredBadge.setFont(new Font("Segoe UI", Font.BOLD, 11));
        card.add(upgradeRequiredBadge, gbc);

        gbc.gridy = 1;
        gbc.insets = new Insets(0, 0, 6, 0);
        upgradeRequiredTitle = new JLabel("Plan Upgrade Required");
        upgradeRequiredTitle.setFont(new Font("Segoe UI", Font.BOLD, 20));
        upgradeRequiredTitle.setForeground(ThemeColors.textPrimary());
        card.add(upgradeRequiredTitle, gbc);

        gbc.gridy = 2;
        gbc.insets = new Insets(0, 20, 16, 20);
        upgradeRequiredDesc = new JLabel(
                "<html><center style='width: 460px; font-size: 12px; color: #888888; line-height: 1.5;'>"
                        + "This advanced diagnostic module requires an upgraded subscription tier.<br/>"
                        + "The Photo Metadata Restorer engine remains 100% free with unlimited local processing."
                        + "</center></html>",
                SwingConstants.CENTER);
        card.add(upgradeRequiredDesc, gbc);

        // Feature benefits row
        gbc.gridy = 3;
        gbc.insets = new Insets(0, 0, 24, 0);
        JPanel featsRow = new JPanel(new FlowLayout(FlowLayout.CENTER, 8, 0));
        featsRow.setOpaque(false);
        featsRow.add(UiFactory.createBadge("EXIF Tag Inspector", ThemeColors.pillBg(), ThemeColors.textSecondary()));
        featsRow.add(UiFactory.createBadge("Duplicate Photo Purge", ThemeColors.pillBg(), ThemeColors.textSecondary()));
        featsRow.add(UiFactory.createBadge("Archive Side-by-Side Compare", ThemeColors.pillBg(), ThemeColors.textSecondary()));
        featsRow.add(UiFactory.createBadge("2GB Volume Splitting", ThemeColors.pillBg(), ThemeColors.textSecondary()));
        card.add(featsRow, gbc);

        // Buttons row: Return to Restorer + Upgrade on Web
        gbc.gridy = 4;
        gbc.insets = new Insets(0, 0, 0, 0);
        JPanel btnRow = new JPanel(new FlowLayout(FlowLayout.CENTER, 10, 0));
        btnRow.setOpaque(false);

        JButton btnReturnRestorer = UiFactory.createSecondaryButton("← Back to Restorer");
        btnReturnRestorer.setPreferredSize(new Dimension(170, 38));
        btnReturnRestorer.addActionListener(e -> switchTo(CARD_RESTORE));
        btnRow.add(btnReturnRestorer);

        JButton btnUpgradeWeb = UiFactory.createPrimaryButton("Upgrade on Web");
        javax.swing.Icon zapIcon = UiFactory.svgDynamicIcon("zap", 13, () -> ThemeColors.primaryButtonText());
        if (zapIcon != null) {
            btnUpgradeWeb.setIcon(zapIcon);
            btnUpgradeWeb.setIconTextGap(6);
        }
        btnUpgradeWeb.setPreferredSize(new Dimension(180, 38));
        btnUpgradeWeb.addActionListener(
                e -> com.takeoutfix.shared.util.BrowserUtil.openBrowser("https://takeoutfix.pages.dev/pricing"));
        btnRow.add(btnUpgradeWeb);
        card.add(btnRow, gbc);

        ThemeColors.addThemeListener(() -> {
            if (upgradeRequiredTitle != null) {
                upgradeRequiredTitle.setForeground(ThemeColors.textPrimary());
            }
        });

        return card;
    }

    private void updateUpgradeCardContent(String feature) {
        if (upgradeRequiredTitle == null || upgradeRequiredDesc == null || upgradeRequiredBadge == null)
            return;
        boolean needsSuper = feature != null && (feature.contains("COMPARE") || feature.contains("DUPLICATE")
                || feature.contains("SPLIT") || feature.contains("Compare") || feature.contains("Duplicate"));
        if (needsSuper) {
            upgradeRequiredBadge.setText("SUPER PLAN REQUIRED");
            upgradeRequiredTitle.setText("Super Plan Required");
            upgradeRequiredDesc.setText("<html><center style='width: 460px; font-size: 12px; color: #888888; line-height: 1.5;'>"
                    + "The <b>" + (feature != null ? feature : "Selected") + "</b> engine is exclusive to the <b>Super</b> plan.<br/>"
                    + "Upgrade your subscription to unlock cross-archive duplicate scanning, side-by-side comparison, and 2GB multi-volume archives."
                    + "</center></html>");
        } else {
            upgradeRequiredBadge.setText("PRO / SUPER PLAN REQUIRED");
            upgradeRequiredTitle.setText("Pro Plan Required");
            upgradeRequiredDesc.setText("<html><center style='width: 460px; font-size: 12px; color: #888888; line-height: 1.5;'>"
                    + "The <b>" + (feature != null ? feature : "Selected") + "</b> engine is included with <b>Pro</b> and <b>Super</b> tiers.<br/>"
                    + "The core Photo Metadata Restorer remains 100% free with unlimited local processing."
                    + "</center></html>");
        }
    }

    private JPanel createAuthenticatingCard() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new GridBagLayout());

        GridBagConstraints gbc = new GridBagConstraints();
        gbc.gridx = 0;
        gbc.gridy = 0;
        gbc.insets = new Insets(0, 0, 16, 0);

        JLabel logo = UiFactory.createBrandLogoLabel(56);
        logo.setPreferredSize(new Dimension(56, 56));
        card.add(logo, gbc);

        gbc.gridy = 1;
        gbc.insets = new Insets(0, 0, 8, 0);
        JLabel title = new JLabel("TakeoutFix Operations Center");
        title.setFont(new Font("Segoe UI", Font.BOLD, 20));
        title.setForeground(ThemeColors.textPrimary());
        card.add(title, gbc);

        gbc.gridy = 2;
        gbc.insets = new Insets(0, 20, 20, 20);
        JLabel subtitle = new JLabel("Authenticating session with cloud...", SwingConstants.CENTER);
        subtitle.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        subtitle.setForeground(ThemeColors.textSecondary());
        card.add(subtitle, gbc);

        gbc.gridy = 3;
        gbc.insets = new Insets(0, 0, 0, 0);
        JProgressBar pb = new JProgressBar();
        pb.setIndeterminate(true);
        pb.setPreferredSize(new Dimension(240, 6));
        pb.setForeground(ThemeColors.accent());
        pb.setBackground(ThemeColors.pillBg());
        pb.setBorderPainted(false);
        card.add(pb, gbc);

        return card;
    }

    // B. Source Panel
    public JPanel createSourcePanel() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new GridBagLayout());

        // Row 0: Centered section title
        JLabel title = new JLabel("1. SELECT TAKEOUT SOURCE", SwingConstants.CENTER);
        title.setFont(new Font("Segoe UI", Font.BOLD, 12));
        title.setForeground(ThemeColors.textPrimary());

        GridBagConstraints gbc0 = new GridBagConstraints();
        gbc0.gridx = 0;
        gbc0.gridy = 0;
        gbc0.weightx = 1.0;
        gbc0.anchor = GridBagConstraints.CENTER;
        gbc0.insets = new Insets(0, 0, 10, 0);
        card.add(title, gbc0);

        // Row 1: Centered Buttons
        JPanel btnPanel = new JPanel(new FlowLayout(FlowLayout.CENTER, 14, 0));
        btnPanel.setOpaque(false);

        JButton btnFolder = UiFactory.createPrimaryButton("Browse Folder");
        btnFolder.setPreferredSize(new Dimension(170, 38));
        btnFolder.setToolTipText("Select extracted Takeout directory");
        btnFolder.addActionListener(e -> browseSourceFolder());
        btnPanel.add(btnFolder);

        JButton btnZip = UiFactory.createSecondaryButton("Select ZIP File");
        btnZip.setPreferredSize(new Dimension(170, 38));
        btnZip.setToolTipText("Select Google Takeout .zip archive");
        btnZip.addActionListener(e -> browseSourceZip());
        btnPanel.add(btnZip);

        GridBagConstraints gbc1 = new GridBagConstraints();
        gbc1.gridx = 0;
        gbc1.gridy = 1;
        gbc1.weightx = 1.0;
        gbc1.anchor = GridBagConstraints.CENTER;
        gbc1.insets = new Insets(0, 0, 8, 0);
        card.add(btnPanel, gbc1);

        // Row 2: Centered Helper Text
        JLabel helper = new JLabel(
                "Supports extracted Takeout directories or ZIP archives. Drag & drop here or browse.",
                SwingConstants.CENTER);
        helper.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        helper.setForeground(ThemeColors.textSecondary());

        GridBagConstraints gbc2 = new GridBagConstraints();
        gbc2.gridx = 0;
        gbc2.gridy = 2;
        gbc2.weightx = 1.0;
        gbc2.anchor = GridBagConstraints.CENTER;
        gbc2.insets = new Insets(0, 0, 8, 0);
        card.add(helper, gbc2);

        // Row 3: Status Text / Path Row with Clear Button
        JPanel pathRow = new JPanel(new BorderLayout(6, 0));
        pathRow.setOpaque(false);

        sourcePathLabel.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        sourcePathLabel.setForeground(ThemeColors.textMuted());
        sourcePathLabel.setBorder(BorderFactory.createCompoundBorder(
                new LineBorder(ThemeColors.cardBorder(), 1, true),
                new EmptyBorder(6, 12, 6, 12)));
        pathRow.add(sourcePathLabel, BorderLayout.CENTER);

        btnSourceClear.setFont(new Font("Segoe UI", Font.BOLD, 10));
        btnSourceClear.setPreferredSize(new Dimension(32, 28));
        btnSourceClear.setToolTipText("Clear selected source");
        btnSourceClear.setVisible(false);
        btnSourceClear.addActionListener(e -> clearSource());
        pathRow.add(btnSourceClear, BorderLayout.EAST);

        GridBagConstraints gbc3 = new GridBagConstraints();
        gbc3.gridx = 0;
        gbc3.gridy = 3;
        gbc3.weightx = 1.0;
        gbc3.fill = GridBagConstraints.HORIZONTAL;
        gbc3.insets = new Insets(0, 20, 0, 20);
        card.add(pathRow, gbc3);

        // Drag and drop support for source folder or archive
        if (!GraphicsEnvironment.isHeadless()) {
            card.setDropTarget(new DropTarget() {
                @Override
                public synchronized void drop(DropTargetDropEvent evt) {
                    try {
                        evt.acceptDrop(DnDConstants.ACTION_COPY);
                        @SuppressWarnings("unchecked")
                        List<File> droppedFiles = (List<File>) evt.getTransferable()
                                .getTransferData(DataFlavor.javaFileListFlavor);
                        if (droppedFiles != null && !droppedFiles.isEmpty()) {
                            setSourceFile(droppedFiles.get(0));
                        }
                    } catch (Exception ex) {
                        ex.printStackTrace();
                    }
                }
            });
        }

        ThemeColors.addThemeListener(() -> {
            title.setForeground(ThemeColors.textPrimary());
            helper.setForeground(ThemeColors.textSecondary());
            sourcePathLabel
                    .setForeground(selectedSourcePath.isEmpty() ? ThemeColors.textMuted() : ThemeColors.textPrimary());
            sourcePathLabel.setBorder(BorderFactory.createCompoundBorder(
                    new LineBorder(ThemeColors.cardBorder(), 1, true),
                    new EmptyBorder(6, 12, 6, 12)));
        });

        return card;
    }

    // C. Destination Panel
    public JPanel createDestinationPanel() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new GridBagLayout());

        // Row 0: Centered section title
        JLabel title = new JLabel("2. SELECT DESTINATION FOLDER", SwingConstants.CENTER);
        title.setFont(new Font("Segoe UI", Font.BOLD, 12));
        title.setForeground(ThemeColors.textPrimary());

        GridBagConstraints gbc0 = new GridBagConstraints();
        gbc0.gridx = 0;
        gbc0.gridy = 0;
        gbc0.weightx = 1.0;
        gbc0.anchor = GridBagConstraints.CENTER;
        gbc0.insets = new Insets(0, 0, 10, 0);
        card.add(title, gbc0);

        // Row 1: Centered Button
        JPanel btnPanel = new JPanel(new FlowLayout(FlowLayout.CENTER, 0, 0));
        btnPanel.setOpaque(false);

        JButton btnDest = UiFactory.createSecondaryButton("Select Destination Folder");
        btnDest.setPreferredSize(new Dimension(240, 38));
        btnDest.setToolTipText("Select folder where restored photos will be organized");
        btnDest.addActionListener(e -> browseDestinationFolder());
        btnPanel.add(btnDest);

        GridBagConstraints gbc1 = new GridBagConstraints();
        gbc1.gridx = 0;
        gbc1.gridy = 1;
        gbc1.weightx = 1.0;
        gbc1.anchor = GridBagConstraints.CENTER;
        gbc1.insets = new Insets(0, 0, 8, 0);
        card.add(btnPanel, gbc1);

        // Row 2: Centered Helper Text
        JLabel helper = new JLabel(
                "Photos and videos will be saved here with EXIF metadata. Drag & drop folder here or browse.",
                SwingConstants.CENTER);
        helper.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        helper.setForeground(ThemeColors.textSecondary());

        GridBagConstraints gbc2 = new GridBagConstraints();
        gbc2.gridx = 0;
        gbc2.gridy = 2;
        gbc2.weightx = 1.0;
        gbc2.anchor = GridBagConstraints.CENTER;
        gbc2.insets = new Insets(0, 0, 8, 0);
        card.add(helper, gbc2);

        // Row 3: Status Text / Path Row with Clear Button
        JPanel pathRow = new JPanel(new BorderLayout(6, 0));
        pathRow.setOpaque(false);

        outputPathLabel.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        outputPathLabel.setForeground(ThemeColors.textMuted());
        outputPathLabel.setBorder(BorderFactory.createCompoundBorder(
                new LineBorder(ThemeColors.cardBorder(), 1, true),
                new EmptyBorder(6, 12, 6, 12)));
        pathRow.add(outputPathLabel, BorderLayout.CENTER);

        btnDestClear.setFont(new Font("Segoe UI", Font.BOLD, 10));
        btnDestClear.setPreferredSize(new Dimension(32, 28));
        btnDestClear.setToolTipText("Clear selected destination");
        btnDestClear.setVisible(false);
        btnDestClear.addActionListener(e -> clearDestination());
        pathRow.add(btnDestClear, BorderLayout.EAST);

        GridBagConstraints gbc3 = new GridBagConstraints();
        gbc3.gridx = 0;
        gbc3.gridy = 3;
        gbc3.weightx = 1.0;
        gbc3.fill = GridBagConstraints.HORIZONTAL;
        gbc3.insets = new Insets(0, 20, 0, 20);
        card.add(pathRow, gbc3);

        // Drag and drop support for destination folder
        if (!GraphicsEnvironment.isHeadless()) {
            card.setDropTarget(new DropTarget() {
                @Override
                public synchronized void drop(DropTargetDropEvent evt) {
                    try {
                        evt.acceptDrop(DnDConstants.ACTION_COPY);
                        @SuppressWarnings("unchecked")
                        List<File> droppedFiles = (List<File>) evt.getTransferable()
                                .getTransferData(DataFlavor.javaFileListFlavor);
                        if (droppedFiles != null && !droppedFiles.isEmpty()) {
                            File dropped = droppedFiles.get(0);
                            setDestinationFile(dropped.isDirectory() ? dropped : dropped.getParentFile());
                        }
                    } catch (Exception ex) {
                        ex.printStackTrace();
                    }
                }
            });
        }

        ThemeColors.addThemeListener(() -> {
            title.setForeground(ThemeColors.textPrimary());
            helper.setForeground(ThemeColors.textSecondary());
            outputPathLabel
                    .setForeground(selectedOutputPath.isEmpty() ? ThemeColors.textMuted() : ThemeColors.textPrimary());
            outputPathLabel.setBorder(BorderFactory.createCompoundBorder(
                    new LineBorder(ThemeColors.cardBorder(), 1, true),
                    new EmptyBorder(6, 12, 6, 12)));
        });

        return card;
    }

    // F. Logs Panel
    public JPanel createLogsPanel() {
        return consoleCard;
    }

    private void styleCheckbox(JCheckBox cb) {
        cb.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        cb.setOpaque(false);
        cb.setFocusPainted(false);
        cb.setForeground(ThemeColors.textPrimary());
    }

    private void wireActions() {
        btnStart.addActionListener(e -> {
            if (!userService.isSignedIn() && com.takeoutfix.auth.GuestQuotaStore.isExhausted()) {
                Window win = SwingUtilities.getWindowAncestor(this);
                Frame frame = (win instanceof Frame) ? (Frame) win : null;
                new SignInDialog(frame, userService).setVisible(true);
                return;
            }
            if (onStartCallback != null)
                onStartCallback.run();
        });
        btnPause.addActionListener(e -> {
            if (onPauseCallback != null)
                onPauseCallback.run();
        });
        btnCancel.addActionListener(e -> {
            if (onCancelCallback != null)
                onCancelCallback.run();
        });
        btnOpenFolder.addActionListener(e -> {
            if (onOpenFolderCallback != null)
                onOpenFolderCallback.run();
        });
        splitVolumesCheckbox.addActionListener(e -> {
            if (splitVolumesCheckbox.isSelected() && userService != null && !userService.isFeatureAllowed("SPLIT")) {
                splitVolumesCheckbox.setSelected(false);
                int opt = JOptionPane.showOptionDialog(this,
                        "Compressing output into 2GB split archive volumes requires a Super plan.\nWould you like to review upgrade options on the web?",
                        "Plan Upgrade Required",
                        JOptionPane.YES_NO_OPTION,
                        JOptionPane.INFORMATION_MESSAGE,
                        null,
                        new Object[] { "Upgrade on Web", "Later" },
                        "Upgrade on Web");
                if (opt == JOptionPane.YES_OPTION) {
                    com.takeoutfix.shared.util.BrowserUtil.openBrowser("https://takeoutfix.pages.dev/pricing");
                }
            }
        });
    }

    public void updatePlanBadge() {
        SwingUtilities.invokeLater(() -> {
            if (dashboardPanel != null) {
                dashboardPanel.updateUserData();
            }

            boolean signedIn = userService.isSignedIn();
            if (!signedIn) {
                lastLoggedEmail = null;
                btnStart.setEnabled(true);
                if (com.takeoutfix.auth.GuestQuotaStore.isExhausted()) {
                    btnStart.setText("Sign In with Google to Continue");
                    if (!CARD_RESTORE.equals(currentCard) && !CARD_DASHBOARD.equals(currentCard)) {
                        cardLayout.show(centerCards, CARD_AUTH_REQUIRED);
                    }
                } else {
                    int remaining = com.takeoutfix.auth.GuestQuotaStore.getRemainingFiles();
                    btnStart.setText("Start Restoration (Guest: " + remaining + " files left)");
                    cardLayout.show(centerCards, currentCard);
                }
                revalidate();
                repaint();
                return;
            }

            String currentEmail = userService.getCurrentEmail();
            if (currentEmail != null && !currentEmail.isBlank() && !currentEmail.equals(lastLoggedEmail)) {
                lastLoggedEmail = currentEmail;
                consoleCard.appendLog("SUCCESS", "Signed in as: " + currentEmail + " • Cloud sync active.");
            }

            btnStart.setEnabled(true);
            btnStart.setText("Start Restoration");
            if (CARD_AUTH_REQUIRED.equals(currentCard)) {
                String dest = (pendingToolCard != null && !CARD_DASHBOARD.equals(pendingToolCard))
                        ? pendingToolCard
                        : CARD_RESTORE;
                switchTo(dest);
            } else if (CARD_UPGRADE_REQUIRED.equals(currentCard) && pendingUpgradeFeature != null
                    && userService.isFeatureAllowed(pendingUpgradeFeature)) {
                switchTo(pendingUpgradeFeature);
            } else {
                cardLayout.show(centerCards, currentCard);
            }
            revalidate();
            repaint();
        });
    }

    private void setSourceFile(File sel) {
        if (sel == null || !sel.exists())
            return;
        selectedSourcePath = sel.getAbsolutePath();
        sourcePathLabel.setText("✓ " + sel.getName());
        sourcePathLabel.setForeground(ThemeColors.textPrimary());
        sourcePathLabel.setToolTipText(selectedSourcePath);
        btnSourceClear.setVisible(true);
        consoleCard.appendLog("INFO", "Selected source: " + selectedSourcePath);

        // Async scan source folder or archive to show convenient metadata
        new SwingWorker<String, Void>() {
            @Override
            protected String doInBackground() {
                if (sel.isDirectory()) {
                    File[] files = sel.listFiles();
                    int count = files != null ? files.length : 0;
                    long bytes = 0;
                    if (files != null) {
                        for (File f : files) {
                            if (f.isFile())
                                bytes += f.length();
                        }
                    }
                    return String.format("%s (%d items, %s)", sel.getName(), count, formatBytes(bytes));
                } else {
                    return String.format("%s (Archive, %s)", sel.getName(), formatBytes(sel.length()));
                }
            }

            @Override
            protected void done() {
                try {
                    String info = get();
                    sourcePathLabel.setText(info);
                } catch (Exception ignored) {
                }
            }
        }.execute();
    }

    private void clearSource() {
        selectedSourcePath = "";
        sourcePathLabel.setText("No folder or ZIP archive selected yet");
        sourcePathLabel.setForeground(ThemeColors.textMuted());
        sourcePathLabel.setToolTipText(null);
        btnSourceClear.setVisible(false);
    }

    private java.util.function.Consumer<File> onDestinationChanged;

    public void setOnDestinationChanged(java.util.function.Consumer<File> onDestinationChanged) {
        this.onDestinationChanged = onDestinationChanged;
    }

    private void setDestinationFile(File sel) {
        if (sel == null)
            return;
        File dir = sel.isDirectory() ? sel : sel.getParentFile();
        if (dir == null || !dir.exists())
            return;
        selectedOutputPath = dir.getAbsolutePath();
        long usable = dir.getUsableSpace();
        String storageInfo = usable > 0 ? " (" + formatBytes(usable) + " free)" : "";
        outputPathLabel.setText(selectedOutputPath + storageInfo);
        outputPathLabel.setForeground(ThemeColors.textPrimary());
        outputPathLabel.setToolTipText(selectedOutputPath + storageInfo);
        btnDestClear.setVisible(true);
        consoleCard.appendLog("INFO", "Selected destination directory: " + selectedOutputPath + (usable > 0 ? " [" + formatBytes(usable) + " free disk space]" : ""));
        if (onDestinationChanged != null) {
            onDestinationChanged.accept(dir);
        }
    }

    private void clearDestination() {
        selectedOutputPath = "";
        outputPathLabel.setText("No destination folder selected yet");
        outputPathLabel.setForeground(ThemeColors.textMuted());
        outputPathLabel.setToolTipText(null);
        btnDestClear.setVisible(false);
        if (onDestinationChanged != null) {
            onDestinationChanged.accept(null);
        }
    }

    private static String formatBytes(long bytes) {
        if (bytes < 1024)
            return bytes + " B";
        if (bytes < 1024 * 1024)
            return String.format("%.1f KB", bytes / 1024.0);
        if (bytes < 1024 * 1024 * 1024L)
            return String.format("%.1f MB", bytes / (1024.0 * 1024.0));
        return String.format("%.2f GB", bytes / (1024.0 * 1024.0 * 1024.0));
    }

    private void browseSourceFolder() {
        JFileChooser chooser = new JFileChooser();
        chooser.setDialogTitle("Select Takeout Folder (Extracted or Directory)");
        chooser.setFileSelectionMode(JFileChooser.DIRECTORIES_ONLY);
        if (chooser.showOpenDialog(parentFrame) == JFileChooser.APPROVE_OPTION) {
            setSourceFile(chooser.getSelectedFile());
        }
    }

    private void browseSourceZip() {
        JFileChooser chooser = new JFileChooser();
        chooser.setDialogTitle("Select Google Takeout ZIP Archive (takeout-*.zip)");
        chooser.setFileSelectionMode(JFileChooser.FILES_ONLY);
        chooser.setFileFilter(new FileNameExtensionFilter("ZIP Archives (*.zip, *.tgz, *.tar)", "zip", "tgz", "tar"));
        if (chooser.showOpenDialog(parentFrame) == JFileChooser.APPROVE_OPTION) {
            setSourceFile(chooser.getSelectedFile());
        }
    }

    private void browseDestinationFolder() {
        JFileChooser chooser = new JFileChooser();
        chooser.setDialogTitle("Select Destination Folder for Restored Photos");
        chooser.setFileSelectionMode(JFileChooser.DIRECTORIES_ONLY);
        if (chooser.showOpenDialog(parentFrame) == JFileChooser.APPROVE_OPTION) {
            setDestinationFile(chooser.getSelectedFile());
        }
    }

    public void setExecutionCallbacks(Runnable onStart, Runnable onPause, Runnable onCancel, Runnable onOpenFolder) {
        this.onStartCallback = onStart;
        this.onPauseCallback = onPause;
        this.onCancelCallback = onCancel;
        this.onOpenFolderCallback = onOpenFolder;
    }

    public void setRunningState(boolean running, boolean paused) {
        this.isCurrentlyRunning = running;
        this.isCurrentlyPaused = paused;
        SwingUtilities.invokeLater(() -> {
            btnStart.setEnabled(!running);
            btnPause.setEnabled(running);
            btnPause.setText(paused ? "Resume" : "Pause");
            btnCancel.setEnabled(running);
            btnOpenFolder.setEnabled(!running);
            updateActionButtonColors(running, paused);
            if (running) {
                if (paused) {
                    progressStatusLabel.setText("Status: Paused");
                }
            } else {
                if (progressBar.getValue() < 100) {
                    progressStatusLabel.setText("Status: Ready - Select source and destination to begin.");
                }
            }
            revalidate();
            repaint();
        });
    }

    private JButton createCustomActionButton(String text) {
        JButton btn = new JButton(text) {
            @Override
            protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                int arc = 10;
                g2.setColor(getBackground());
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), arc, arc);

                Color borderCol = (Color) getClientProperty("customBorderColor");
                if (borderCol == null) {
                    borderCol = ThemeColors.cardBorder();
                }
                g2.setColor(borderCol);
                g2.setStroke(new BasicStroke(1.2f));
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, arc, arc);
                g2.dispose();
                super.paintComponent(g);
            }
        };
        btn.setContentAreaFilled(false);
        btn.setOpaque(false);
        btn.setFont(new Font("Segoe UI", Font.BOLD, 11));
        btn.setFocusPainted(false);
        btn.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        btn.putClientProperty("JButton.buttonType", "roundRect");
        btn.setBorder(new EmptyBorder(7, 14, 7, 14));
        return btn;
    }

    private void updateActionButtonColors(boolean running, boolean paused) {
        boolean dark = ThemeColors.isDark();
        if (!running) {
            btnPause.setBackground(ThemeColors.secondaryButtonBg());
            btnPause.setForeground(ThemeColors.textMuted());
            btnPause.putClientProperty("customBorderColor", ThemeColors.cardBorder());

            btnCancel.setBackground(ThemeColors.secondaryButtonBg());
            btnCancel.setForeground(ThemeColors.textMuted());
            btnCancel.putClientProperty("customBorderColor", ThemeColors.cardBorder());
        } else {
            // Cancel: Always Red when running
            Color cancelBg = dark ? new Color(69, 10, 10) : new Color(254, 242, 242);
            Color cancelBorder = dark ? new Color(239, 68, 68, 200) : new Color(239, 68, 68, 180);
            Color cancelFg = dark ? new Color(252, 165, 165) : new Color(220, 38, 38);

            btnCancel.setBackground(cancelBg);
            btnCancel.setForeground(cancelFg);
            btnCancel.putClientProperty("customBorderColor", cancelBorder);

            if (paused) {
                // Resume: Vibrant Blue
                Color resumeBg = dark ? new Color(30, 58, 138) : new Color(239, 246, 255);
                Color resumeBorder = dark ? new Color(59, 130, 246, 200) : new Color(59, 130, 246, 180);
                Color resumeFg = dark ? new Color(191, 219, 254) : new Color(29, 78, 216);

                btnPause.setBackground(resumeBg);
                btnPause.setForeground(resumeFg);
                btnPause.putClientProperty("customBorderColor", resumeBorder);
            } else {
                // Pause: Amber / Yellow
                Color pauseBg = dark ? new Color(69, 26, 3) : new Color(254, 243, 199);
                Color pauseBorder = dark ? new Color(245, 158, 11, 200) : new Color(245, 158, 11, 180);
                Color pauseFg = dark ? new Color(253, 230, 138) : new Color(180, 83, 9);

                btnPause.setBackground(pauseBg);
                btnPause.setForeground(pauseFg);
                btnPause.putClientProperty("customBorderColor", pauseBorder);
            }
        }
        btnPause.repaint();
        btnCancel.repaint();
    }

    public void setProgress(int percent, String message) {
        SwingUtilities.invokeLater(() -> {
            progressBar.setValue(percent);
            progressPercentLabel.setText(percent + "%");
            progressStatusLabel.setText(message);
        });
    }

    public void setProgressTelemetry(int percent, String message, long elapsedSec, long etaSec, double filesPerSec,
            double mbPerSec) {
        SwingUtilities.invokeLater(() -> {
            progressBar.setValue(percent);
            progressPercentLabel.setText(percent + "%");
            progressStatusLabel.setText(message);

            String elapsedStr = formatDuration(elapsedSec);
            String etaStr = (etaSec > 0 && percent < 100) ? formatDuration(etaSec)
                    : (percent >= 100 ? "00:00" : "--:--");
            elapsedLabel.setText("⏱ Elapsed: " + elapsedStr);
            speedLabel.setText(String.format(java.util.Locale.US, "Speed: %.1f files/s • %.1f MB/s", filesPerSec, mbPerSec));
            etaLabel.setText("⏳ ETA: " + etaStr);
        });
    }

    private static String formatDuration(long totalSeconds) {
        long hours = totalSeconds / 3600;
        long minutes = (totalSeconds % 3600) / 60;
        long seconds = totalSeconds % 60;
        if (hours > 0) {
            return String.format(java.util.Locale.US, "%02d:%02d:%02d", hours, minutes, seconds);
        } else {
            return String.format(java.util.Locale.US, "%02d:%02d", minutes, seconds);
        }
    }

    public String getSourcePath() {
        return selectedSourcePath;
    }

    public String getOutputPath() {
        return selectedOutputPath;
    }

    public Optional<Instant> getArchiveDateOverride() {
        String text = dateOverrideField.getText().trim();
        if (text.isEmpty() || text.startsWith("YYYY-MM-DD")) {
            return Optional.empty();
        }
        try {
            LocalDate date = LocalDate.parse(text, DateTimeFormatter.ISO_LOCAL_DATE);
            return Optional.of(date.atStartOfDay(ZoneId.systemDefault()).toInstant());
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    public boolean isOrganizeYearMonth() {
        return organizeYearMonthCheckbox.isSelected();
    }

    public boolean isSplitVolumes() {
        return splitVolumesCheckbox.isSelected();
    }

    public boolean isSmartInterpolation() {
        return smartInterpolationCheckbox.isSelected();
    }

    public boolean isPowerKeepAwake() {
        return powerKeepAwakeCheckbox.isSelected();
    }

    public ConsoleCard getConsoleCard() {
        return consoleCard;
    }

    public JPanel getUpgradeBannerPanel() {
        return null;
    }

    private String pendingToolCard = null;

    public void switchTo(String cardName) {
        SwingUtilities.invokeLater(() -> {
            String target = mapToCardName(cardName);
            boolean signedIn = userService != null && userService.isSignedIn();
            if (!CARD_RESTORE.equalsIgnoreCase(target) && !CARD_DASHBOARD.equalsIgnoreCase(target) && !signedIn) {
                this.pendingToolCard = target;
                this.currentCard = CARD_AUTH_REQUIRED;
                cardLayout.show(centerCards, CARD_AUTH_REQUIRED);
                if (headerRow != null)
                    headerRow.setVisible(true);
                updateHeaderForCard(CARD_AUTH_REQUIRED);
                if (moduleSelect != null) {
                    updatingModuleSelect = true;
                    try {
                        moduleSelect.setSelectedItem(target);
                    } finally {
                        updatingModuleSelect = false;
                    }
                }
                if (onCardChange != null) {
                    try {
                        onCardChange.accept(target);
                    } catch (Exception ignored) {
                    }
                }
                return;
            }

            // Cloud Payment & Tier Locking Check
            if (userService != null && !userService.isFeatureAllowed(target)) {
                this.pendingUpgradeFeature = target;
                this.currentCard = CARD_UPGRADE_REQUIRED;
                updateUpgradeCardContent(target);
                cardLayout.show(centerCards, CARD_UPGRADE_REQUIRED);
                if (headerRow != null)
                    headerRow.setVisible(true);
                updateHeaderForCard(CARD_UPGRADE_REQUIRED);
                if (moduleSelect != null && !target.equals(moduleSelect.getSelectedItem())) {
                    updatingModuleSelect = true;
                    try {
                        moduleSelect.setSelectedItem(target);
                    } finally {
                        updatingModuleSelect = false;
                    }
                }
                if (onCardChange != null) {
                    try {
                        onCardChange.accept(target);
                    } catch (Exception ignored) {
                    }
                }
                return;
            }

            this.pendingToolCard = null;
            this.pendingUpgradeFeature = null;
            this.currentCard = target;
            cardLayout.show(centerCards, target);
            if (CARD_DASHBOARD.equalsIgnoreCase(target)) {
                if (headerRow != null)
                    headerRow.setVisible(false);
                if (moduleSelect != null && !target.equals(moduleSelect.getSelectedItem())) {
                    updatingModuleSelect = true;
                    try {
                        moduleSelect.setSelectedItem(target);
                    } finally {
                        updatingModuleSelect = false;
                    }
                }
            } else {
                if (headerRow != null)
                    headerRow.setVisible(true);
                updateHeaderForCard(target);
                if (moduleSelect != null && !target.equals(moduleSelect.getSelectedItem())) {
                    updatingModuleSelect = true;
                    try {
                        moduleSelect.setSelectedItem(target);
                    } finally {
                        updatingModuleSelect = false;
                    }
                }
            }
            if (onCardChange != null) {
                try {
                    onCardChange.accept(target);
                } catch (Exception ignored) {
                }
            }
        });
    }

    public void closeOpenPopups() {
        if (moduleSelect != null && moduleSelect.isPopupVisible()) {
            moduleSelect.hidePopup();
        }
    }

    private void updateHeaderForCard(String card) {
        if (CARD_RESTORE.equalsIgnoreCase(card)) {
            mainTitle.setText("RECOVERY OPS CENTER");
            subtitle.setText("Select Takeout archive source, choose destination folder, and restore metadata.");
        } else if (CARD_DASHBOARD.equalsIgnoreCase(card)) {
            mainTitle.setText("OPERATIONS DASHBOARD");
            subtitle.setText("Live overview of storage quotas, device resources, and active restoration jobs.");
        } else if (CARD_EXIF.equalsIgnoreCase(card)) {
            mainTitle.setText("EXIF & METADATA INSPECTOR (BETA)");
            subtitle.setText("Inspect embedded camera tags, GPS coordinates, and raw EXIF/XMP sidecars.");
        } else if (CARD_COMPARE.equalsIgnoreCase(card)) {
            mainTitle.setText("METADATA COMPARISON (BETA)");
            subtitle.setText("Compare original Takeout exports side-by-side with restored photo headers.");
        } else if (CARD_DUPLICATE.equalsIgnoreCase(card)) {
            mainTitle.setText("DUPLICATE PHOTO FINDER (BETA)");
            subtitle.setText("Scan archive collections to identify, group, and purge identical photo copies.");
        } else if (CARD_AUTH_REQUIRED.equalsIgnoreCase(card)) {
            mainTitle.setText("AUTHENTICATION REQUIRED");
            subtitle.setText("Please sign in to access TakeoutFix restoration and diagnostic tools.");
        } else if (CARD_UPGRADE_REQUIRED.equalsIgnoreCase(card)) {
            mainTitle.setText("SUBSCRIPTION UPGRADE REQUIRED");
            subtitle.setText("This diagnostic capability requires a Pro or Super subscription tier.");
        }
    }

    public static String mapToCardName(String input) {
        if (input == null)
            return CARD_RESTORE;
        String s = input.trim();
        if (s.equalsIgnoreCase("Dashboard") || s.equalsIgnoreCase(CARD_DASHBOARD))
            return CARD_DASHBOARD;
        if (s.equalsIgnoreCase("Restore") || s.equalsIgnoreCase(CARD_RESTORE))
            return CARD_RESTORE;
        if (s.contains("EXIF") || s.contains("Inspector"))
            return CARD_EXIF;
        if (s.contains("Compare") || s.contains("Comparison"))
            return CARD_COMPARE;
        if (s.contains("Duplicate") || s.contains("Cleaner"))
            return CARD_DUPLICATE;
        return s;
    }

    public DashboardPanel getDashboardPanel() {
        return dashboardPanel;
    }

    public NetworkMonitorService getNetService() {
        return netService;
    }
}
