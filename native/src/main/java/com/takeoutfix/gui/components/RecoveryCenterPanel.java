package com.takeoutfix.gui.components;

import com.takeoutfix.gui.service.NetworkMonitorService;
import com.takeoutfix.gui.service.UserSyncBridgeService;
import com.takeoutfix.gui.theme.ThemeColors;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import javax.swing.border.LineBorder;
import javax.swing.filechooser.FileNameExtensionFilter;
import java.awt.*;
import java.awt.datatransfer.DataFlavor;
import java.awt.dnd.DnDConstants;
import java.awt.dnd.DropTarget;
import java.awt.dnd.DropTargetDropEvent;
import java.io.File;
import java.net.URI;
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
 * 1. Restore Archive (Source, Destination, Combined Options & Controls, Terminal Logs)
 * 2. EXIF Viewer (Super)
 * 3. Comparison (Super)
 * 4. Duplicates (Super)
 */
public class RecoveryCenterPanel extends JPanel {

    public static final String CARD_DASHBOARD = "Dashboard Overview";
    public static final String CARD_RESTORE = "Restore Archive";
    public static final String CARD_EXIF = "EXIF Viewer (Super)";
    public static final String CARD_COMPARE = "Comparison (Super)";
    public static final String CARD_DUPLICATE = "Duplicates (Super)";
    public static final String CARD_LOCKED = "Super Feature Locked";
    public static final String CARD_AUTH_REQUIRED = "Sign In Required";

    private final CardLayout cardLayout = new CardLayout();
    private final JPanel centerCards = new JPanel(cardLayout);

    // Inputs & Selection
    private String selectedSourcePath = "";
    private String selectedOutputPath = "";
    private final JLabel sourcePathLabel = new JLabel("No folder or ZIP archive selected yet", SwingConstants.CENTER);
    private final JLabel outputPathLabel = new JLabel("No destination folder selected yet", SwingConstants.CENTER);
    private final JButton btnSourceClear = UiFactory.createSecondaryButton("✕");
    private final JButton btnDestClear = UiFactory.createSecondaryButton("✕");

    // Options
    private final JTextField dateOverrideField = UiFactory.createTextField("YYYY-MM-DD (e.g. 2024-05-15)");
    private final JButton btnDatePicker = UiFactory.createSecondaryButton("Select Date");
    private final JCheckBox organizeYearMonthCheckbox = new JCheckBox("Organize into Month/Year subfolders inside original folders (Album/YYYY-MM)", true);
    private final JCheckBox splitVolumesCheckbox = new JCheckBox("Compress output into 2GB ZIP volumes");
    private final JCheckBox smartInterpolationCheckbox = new JCheckBox("Smart Adjacent Timestamp Interpolation", true);
    private final JCheckBox powerKeepAwakeCheckbox = new JCheckBox("Prevent System Sleep while processing", true);

    // Controls & Status
    private final JButton btnStart;
    private final JButton btnPause;
    private final JButton btnCancel;
    private final JButton btnOpenFolder;

    private final JLabel progressStatusLabel = new JLabel("Status: Ready - Select source and destination to begin.");
    private final JProgressBar progressBar = UiFactory.createSlimProgressBar();
    private final JLabel progressPercentLabel = new JLabel("0%");

    private final JLabel elapsedLabel = new JLabel("⏱ Elapsed: 00:00");
    private final JLabel speedLabel = new JLabel("⚡ Speed: 0.0 files/s • 0.0 MB/s");
    private final JLabel etaLabel = new JLabel("⏳ ETA: --:--");

    // Upgrade & Quota Alert Banners
    private final JPanel upgradeBannerPanel;
    private final JLabel upgradeBannerText;
    private final JPanel quotaAlertBanner;

    // Logs
    private final ConsoleCard consoleCard = new ConsoleCard();

    private final Component parentFrame;
    private final NetworkMonitorService netService;
    private final UserSyncBridgeService userService;

    // Sub-tool panels
    private final DashboardPanel dashboardPanel;
    private final ExifViewerPanel exifViewerPanel;
    private final ComparisonPanel comparisonPanel;
    private final DuplicateFinderPanel duplicateFinderPanel;

    private Runnable onStartCallback;
    private Runnable onPauseCallback;
    private Runnable onCancelCallback;
    private Runnable onOpenFolderCallback;

    private JComboBox<String> moduleSelect;
    private Consumer<String> onCardChange = null;

    public void setOnCardChangeListener(Consumer<String> listener) {
        this.onCardChange = listener;
    }

    public RecoveryCenterPanel(Component parentFrame, NetworkMonitorService netService, UserSyncBridgeService userService) {
        this.parentFrame = parentFrame;
        this.netService = netService;
        this.userService = userService;

        setLayout(new BorderLayout(0, 10));
        setBorder(new EmptyBorder(16, 16, 16, 16));

        Runnable updateTheme = () -> {
            setBackground(ThemeColors.canvasBg());
            repaint();
        };
        updateTheme.run();
        ThemeColors.addThemeListener(updateTheme);

        btnStart = UiFactory.createPrimaryButton("Start Restoration");
        btnStart.setPreferredSize(new Dimension(170, 38));

        btnPause = UiFactory.createSecondaryButton("Pause");
        btnPause.setPreferredSize(new Dimension(110, 38));
        btnPause.setEnabled(false);

        btnCancel = UiFactory.createSecondaryButton("Cancel");
        btnCancel.setPreferredSize(new Dimension(110, 38));
        btnCancel.setEnabled(false);

        btnOpenFolder = UiFactory.createSecondaryButton("Open Output Folder");
        btnOpenFolder.setPreferredSize(new Dimension(170, 38));

        upgradeBannerText = new JLabel("Free Tier: Limited to 250 files / 500 MB. Upgrade to Pro or Super for unlimited restorations.");
        upgradeBannerPanel = createUpgradeBanner();
        quotaAlertBanner = createQuotaAlertBanner();

        // Instantiate sub-tool panels
        dashboardPanel = new DashboardPanel(userService, netService, this::switchTo);
        exifViewerPanel = new ExifViewerPanel(userService);
        comparisonPanel = new ComparisonPanel(userService);
        duplicateFinderPanel = new DuplicateFinderPanel(userService);

        // Header Row (contains the tool dropdown from Screenshot 5)
        add(createHeaderRow(), BorderLayout.NORTH);

        // Center Cards
        centerCards.setOpaque(false);
        centerCards.add(dashboardPanel, CARD_DASHBOARD);
        centerCards.add(createRestoreDashboardCard(), CARD_RESTORE);
        centerCards.add(exifViewerPanel, CARD_EXIF);
        centerCards.add(comparisonPanel, CARD_COMPARE);
        centerCards.add(duplicateFinderPanel, CARD_DUPLICATE);
        centerCards.add(createLockedPaywallCard(), CARD_LOCKED);
        centerCards.add(createAuthRequiredCard(), CARD_AUTH_REQUIRED);
        add(centerCards, BorderLayout.CENTER);

        wireActions();
        updatePlanBadge();

        if (!userService.isSignedIn()) {
            cardLayout.show(centerCards, CARD_AUTH_REQUIRED);
        } else {
            cardLayout.show(centerCards, CARD_DASHBOARD);
        }
    }

    private JPanel createRestoreDashboardCard() {
        JPanel panel = new JPanel(new GridBagLayout());
        panel.setOpaque(false);
        int gridY = 0;

        // 1. Source & Destination Panels (Side-by-side in 50/50 GridLayout)
        JPanel sourceAndDest = createSourceAndDestinationPanel();
        panel.add(sourceAndDest, createConstraints(gridY++, 0.0, GridBagConstraints.HORIZONTAL, 12));

        // 2. Quota Alert Banner (Shown when quota is exceeded)
        panel.add(quotaAlertBanner, createConstraints(gridY++, 0.0, GridBagConstraints.HORIZONTAL, 10));

        // 3. Combined Advanced Options & Controls Card (As requested in Screenshot 1)
        JPanel combinedCard = createCombinedOptionsAndControlsCard();
        panel.add(combinedCard, createConstraints(gridY++, 0.0, GridBagConstraints.HORIZONTAL, 12));

        // 4. Logs Panel (Consumes ALL remaining vertical space)
        JPanel logsPanel = createLogsPanel();
        GridBagConstraints logsGbc = new GridBagConstraints();
        logsGbc.gridx = 0;
        logsGbc.gridy = gridY++;
        logsGbc.weightx = 1.0;
        logsGbc.weighty = 1.0;
        logsGbc.fill = GridBagConstraints.BOTH;
        logsGbc.anchor = GridBagConstraints.CENTER;
        logsGbc.insets = new Insets(0, 0, 0, 0);
        panel.add(logsPanel, logsGbc);

        return panel;
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
        JPanel row = new JPanel(new BorderLayout(10, 0));
        row.setOpaque(false);

        JPanel titleBlock = new JPanel(new GridLayout(2, 1, 0, 2));
        titleBlock.setOpaque(false);

        JLabel mainTitle = new JLabel("RECOVERY OPS CENTER");
        mainTitle.setFont(new Font("Segoe UI", Font.BOLD, 15));
        mainTitle.setForeground(ThemeColors.textPrimary());
        titleBlock.add(mainTitle);

        JLabel subtitle = new JLabel("Select Takeout archive source, choose destination folder, and restore metadata.");
        subtitle.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        subtitle.setForeground(ThemeColors.textSecondary());
        titleBlock.add(subtitle);

        row.add(titleBlock, BorderLayout.WEST);

        // Tool Dropdown matching Screenshot 5 1:1
        moduleSelect = new JComboBox<>(new String[]{
                CARD_DASHBOARD,
                CARD_RESTORE,
                CARD_EXIF,
                CARD_COMPARE,
                CARD_DUPLICATE
        });
        moduleSelect.setSelectedItem(CARD_DASHBOARD);
        moduleSelect.setFont(new Font("Segoe UI", Font.BOLD, 12));
        moduleSelect.setBackground(ThemeColors.inputBg());
        moduleSelect.setForeground(ThemeColors.textPrimary());
        moduleSelect.setPreferredSize(new Dimension(220, 36));

        moduleSelect.addActionListener(e -> {
            String selected = (String) moduleSelect.getSelectedItem();
            if (selected != null) {
                if (!userService.isSignedIn()) {
                    cardLayout.show(centerCards, CARD_AUTH_REQUIRED);
                } else if (!selected.equals(CARD_RESTORE) && !selected.equals(CARD_DASHBOARD) && !userService.isFeaturesUnlocked()) {
                    cardLayout.show(centerCards, CARD_LOCKED);
                } else {
                    cardLayout.show(centerCards, selected);
                }
                if (onCardChange != null) {
                    try { onCardChange.accept(selected); } catch (Exception ignored) {}
                }
            }
        });
        row.add(moduleSelect, BorderLayout.EAST);

        ThemeColors.addThemeListener(() -> {
            mainTitle.setForeground(ThemeColors.textPrimary());
            subtitle.setForeground(ThemeColors.textSecondary());
            moduleSelect.setBackground(ThemeColors.inputBg());
            moduleSelect.setForeground(ThemeColors.textPrimary());
        });

        return row;
    }

    private JPanel createLockedPaywallCard() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new GridBagLayout());

        GridBagConstraints gbc = new GridBagConstraints();
        gbc.gridx = 0;
        gbc.gridy = 0;
        gbc.insets = new Insets(0, 0, 12, 0);

        JLabel lockLabel = new JLabel("LOCKED FEATURE (SUPER PLAN REQUIRED)");
        lockLabel.setFont(new Font("Segoe UI", Font.BOLD, 14));
        lockLabel.setForeground(ThemeColors.accent());
        card.add(lockLabel, gbc);

        JLabel desc = new JLabel("<html><div style='text-align: center; max-width: 520px; font-size: 12px; color: #888888;'>"
                + "This advanced tool (EXIF Viewer, Metadata Comparison, or Duplicate Finder) is exclusively available to <b>TakeoutFix Super</b> subscribers.<br><br>"
                + "Takeout archive restoration is fully accessible on the free tier. Upgrade your account on the web to unlock deep metadata analysis."
                + "</div></html>", SwingConstants.CENTER);
        gbc.gridy = 1;
        gbc.insets = new Insets(0, 0, 20, 0);
        card.add(desc, gbc);

        JPanel btnRow = new JPanel(new FlowLayout(FlowLayout.CENTER, 14, 0));
        btnRow.setOpaque(false);

        JButton btnUpgrade = UiFactory.createPrimaryButton("Upgrade to Super");
        btnUpgrade.addActionListener(e -> {
            try { Desktop.getDesktop().browse(new URI("https://takeoutfix.pages.dev/pricing")); } catch (Exception ignored) {}
        });
        btnRow.add(btnUpgrade);

        JButton btnBack = UiFactory.createSecondaryButton("Back to Restore Archive");
        btnBack.addActionListener(e -> {
            if (moduleSelect != null) {
                moduleSelect.setSelectedItem(CARD_RESTORE);
            }
        });
        btnRow.add(btnBack);

        gbc.gridy = 2;
        gbc.insets = new Insets(0, 0, 0, 0);
        card.add(btnRow, gbc);

        return card;
    }

    private JPanel createAuthRequiredCard() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new GridBagLayout());

        GridBagConstraints gbc = new GridBagConstraints();
        gbc.gridx = 0;
        gbc.gridy = 0;
        gbc.insets = new Insets(0, 0, 16, 0);

        JLabel lockLabel = UiFactory.createLogoBadge("LOCK", new Color(239, 68, 68), Color.WHITE);
        lockLabel.setFont(new Font("Segoe UI", Font.BOLD, 13));
        lockLabel.setBorder(new EmptyBorder(6, 14, 6, 14));
        card.add(lockLabel, gbc);

        gbc.gridy = 1;
        gbc.insets = new Insets(0, 0, 8, 0);
        JLabel title = new JLabel("Authentication Required");
        title.setFont(new Font("Segoe UI", Font.BOLD, 22));
        title.setForeground(ThemeColors.textPrimary());
        card.add(title, gbc);

        gbc.gridy = 2;
        gbc.insets = new Insets(0, 30, 24, 30);
        JLabel desc = new JLabel("<html><center style='width: 440px; font-size: 12px; color: #888888;'>"
                + "You must be signed in to access TakeoutFix restoration engines, EXIF metadata tools, and archive processing.<br><br>"
                + "Sign in with your Google or Email account to activate access according to your tier."
                + "</center></html>", SwingConstants.CENTER);
        card.add(desc, gbc);

        gbc.gridy = 3;
        gbc.insets = new Insets(0, 0, 12, 0);
        JButton btnGoogle = UiFactory.createPrimaryButton("  Sign In with Google");
        btnGoogle.setPreferredSize(new Dimension(280, 42));
        btnGoogle.addActionListener(e -> {
            Window win = SwingUtilities.getWindowAncestor(this);
            Frame frame = (win instanceof Frame) ? (Frame) win : null;
            new SignInDialog(frame, userService).setVisible(true);
        });
        card.add(btnGoogle, gbc);

        gbc.gridy = 4;
        gbc.insets = new Insets(0, 0, 0, 0);
        JButton btnEmail = UiFactory.createSecondaryButton("Sign In with Email & Password");
        btnEmail.setPreferredSize(new Dimension(280, 38));
        btnEmail.addActionListener(e -> {
            Window win = SwingUtilities.getWindowAncestor(this);
            Frame frame = (win instanceof Frame) ? (Frame) win : null;
            new SignInDialog(frame, userService).setVisible(true);
        });
        card.add(btnEmail, gbc);

        ThemeColors.addThemeListener(() -> {
            title.setForeground(ThemeColors.textPrimary());
        });

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
        JLabel helper = new JLabel("Supports extracted Takeout directories or ZIP archives. Drag & drop here or browse.", SwingConstants.CENTER);
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
                new EmptyBorder(6, 12, 6, 12)
        ));
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
        card.setDropTarget(new DropTarget() {
            @Override
            public synchronized void drop(DropTargetDropEvent evt) {
                try {
                    evt.acceptDrop(DnDConstants.ACTION_COPY);
                    @SuppressWarnings("unchecked")
                    List<File> droppedFiles = (List<File>) evt.getTransferable().getTransferData(DataFlavor.javaFileListFlavor);
                    if (droppedFiles != null && !droppedFiles.isEmpty()) {
                        setSourceFile(droppedFiles.get(0));
                    }
                } catch (Exception ex) {
                    ex.printStackTrace();
                }
            }
        });

        ThemeColors.addThemeListener(() -> {
            title.setForeground(ThemeColors.textPrimary());
            helper.setForeground(ThemeColors.textSecondary());
            sourcePathLabel.setForeground(selectedSourcePath.isEmpty() ? ThemeColors.textMuted() : ThemeColors.textPrimary());
            sourcePathLabel.setBorder(BorderFactory.createCompoundBorder(
                    new LineBorder(ThemeColors.cardBorder(), 1, true),
                    new EmptyBorder(6, 12, 6, 12)
            ));
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
        JLabel helper = new JLabel("Photos and videos will be saved here with EXIF metadata. Drag & drop folder here or browse.", SwingConstants.CENTER);
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
                new EmptyBorder(6, 12, 6, 12)
        ));
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
        card.setDropTarget(new DropTarget() {
            @Override
            public synchronized void drop(DropTargetDropEvent evt) {
                try {
                    evt.acceptDrop(DnDConstants.ACTION_COPY);
                    @SuppressWarnings("unchecked")
                    List<File> droppedFiles = (List<File>) evt.getTransferable().getTransferData(DataFlavor.javaFileListFlavor);
                    if (droppedFiles != null && !droppedFiles.isEmpty()) {
                        File dropped = droppedFiles.get(0);
                        setDestinationFile(dropped.isDirectory() ? dropped : dropped.getParentFile());
                    }
                } catch (Exception ex) {
                    ex.printStackTrace();
                }
            }
        });

        ThemeColors.addThemeListener(() -> {
            title.setForeground(ThemeColors.textPrimary());
            helper.setForeground(ThemeColors.textSecondary());
            outputPathLabel.setForeground(selectedOutputPath.isEmpty() ? ThemeColors.textMuted() : ThemeColors.textPrimary());
            outputPathLabel.setBorder(BorderFactory.createCompoundBorder(
                    new LineBorder(ThemeColors.cardBorder(), 1, true),
                    new EmptyBorder(6, 12, 6, 12)
            ));
        });

        return card;
    }

    // D. Combined Advanced Options & Controls Card (Combining both boxes into one as in Screenshot 1)
    public JPanel createCombinedOptionsAndControlsCard() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new GridBagLayout());

        GridBagConstraints gbc = new GridBagConstraints();
        gbc.gridx = 0;
        gbc.gridy = 0;
        gbc.gridwidth = 2;
        gbc.weightx = 1.0;
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.insets = new Insets(0, 0, 8, 0);

        JLabel title = new JLabel("ADVANCED RESTORATION OPTIONS & CONTROLS");
        title.setFont(new Font("Segoe UI", Font.BOLD, 11));
        title.setForeground(ThemeColors.textSecondary());
        card.add(title, gbc);

        // Column 0: Archive Date Override + DatePicker Button
        JPanel leftCol = new JPanel(new GridBagLayout());
        leftCol.setOpaque(false);
        GridBagConstraints lgbc = new GridBagConstraints();
        lgbc.gridx = 0;
        lgbc.gridy = 0;
        lgbc.gridwidth = 2;
        lgbc.weightx = 1.0;
        lgbc.fill = GridBagConstraints.HORIZONTAL;
        lgbc.insets = new Insets(0, 0, 4, 0);

        JLabel dateLbl = new JLabel("Archive Date Override (Fallback for Missing Timestamps):");
        dateLbl.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        dateLbl.setForeground(ThemeColors.textPrimary());
        leftCol.add(dateLbl, lgbc);

        // Date input row with DatePicker Button
        lgbc.gridy = 1;
        lgbc.gridwidth = 1;
        lgbc.insets = new Insets(0, 0, 0, 6);
        leftCol.add(dateOverrideField, lgbc);

        btnDatePicker.setFont(new Font("Segoe UI", Font.BOLD, 11));
        btnDatePicker.addActionListener(e -> {
            DatePickerDialog dp = new DatePickerDialog(this, dateOverrideField.getText(), dateOverrideField::setText);
            dp.setVisible(true);
        });
        lgbc.gridx = 1;
        lgbc.weightx = 0.0;
        lgbc.insets = new Insets(0, 0, 0, 0);
        leftCol.add(btnDatePicker, lgbc);

        gbc.gridx = 0;
        gbc.gridy = 1;
        gbc.gridwidth = 1;
        gbc.weightx = 0.5;
        gbc.insets = new Insets(0, 0, 10, 16);
        card.add(leftCol, gbc);

        // Column 1: Checkboxes
        JPanel rightCol = new JPanel();
        rightCol.setLayout(new BoxLayout(rightCol, BoxLayout.Y_AXIS));
        rightCol.setOpaque(false);

        styleCheckbox(organizeYearMonthCheckbox);
        rightCol.add(organizeYearMonthCheckbox);
        rightCol.add(Box.createVerticalStrut(4));

        styleCheckbox(splitVolumesCheckbox);
        rightCol.add(splitVolumesCheckbox);
        rightCol.add(Box.createVerticalStrut(4));

        styleCheckbox(smartInterpolationCheckbox);
        rightCol.add(smartInterpolationCheckbox);
        rightCol.add(Box.createVerticalStrut(4));

        styleCheckbox(powerKeepAwakeCheckbox);
        rightCol.add(powerKeepAwakeCheckbox);

        gbc.gridx = 1;
        gbc.gridy = 1;
        gbc.gridwidth = 1;
        gbc.weightx = 0.5;
        gbc.insets = new Insets(0, 0, 10, 0);
        card.add(rightCol, gbc);

        // Separator Divider
        JSeparator sep = new JSeparator();
        sep.setForeground(ThemeColors.cardBorder());
        gbc.gridx = 0;
        gbc.gridy = 2;
        gbc.gridwidth = 2;
        gbc.insets = new Insets(0, 0, 10, 0);
        card.add(sep, gbc);

        // Bottom Section: Status + Percent Row
        JPanel statusRow = new JPanel(new BorderLayout());
        statusRow.setOpaque(false);

        progressStatusLabel.setFont(new Font("Segoe UI", Font.BOLD, 11));
        progressStatusLabel.setForeground(ThemeColors.textPrimary());
        statusRow.add(progressStatusLabel, BorderLayout.WEST);

        progressPercentLabel.setFont(new Font("Segoe UI", Font.BOLD, 12));
        progressPercentLabel.setForeground(ThemeColors.accent());
        statusRow.add(progressPercentLabel, BorderLayout.EAST);

        gbc.gridy = 3;
        gbc.insets = new Insets(0, 0, 6, 0);
        card.add(statusRow, gbc);

        // Progress Bar
        gbc.gridy = 4;
        gbc.insets = new Insets(0, 0, 6, 0);
        card.add(progressBar, gbc);

        // Telemetry Row: Elapsed, Speed, ETA
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

        gbc.gridy = 5;
        gbc.insets = new Insets(0, 0, 10, 0);
        card.add(telemetryRow, gbc);

        // Action Buttons Row
        JPanel btnRow = new JPanel(new FlowLayout(FlowLayout.CENTER, 10, 0));
        btnRow.setOpaque(false);
        btnRow.add(btnStart);
        btnRow.add(btnPause);
        btnRow.add(btnCancel);
        btnRow.add(btnOpenFolder);

        gbc.gridy = 6;
        gbc.insets = new Insets(0, 0, 0, 0);
        card.add(btnRow, gbc);

        ThemeColors.addThemeListener(() -> {
            title.setForeground(ThemeColors.textSecondary());
            dateLbl.setForeground(ThemeColors.textPrimary());
            progressStatusLabel.setForeground(ThemeColors.textPrimary());
            progressPercentLabel.setForeground(ThemeColors.accent());
            elapsedLabel.setForeground(ThemeColors.textSecondary());
            speedLabel.setForeground(ThemeColors.textSecondary());
            etaLabel.setForeground(ThemeColors.accent());
            sep.setForeground(ThemeColors.cardBorder());
            styleCheckbox(organizeYearMonthCheckbox);
            styleCheckbox(splitVolumesCheckbox);
            styleCheckbox(smartInterpolationCheckbox);
            styleCheckbox(powerKeepAwakeCheckbox);
        });

        return card;
    }

    // E. Upgrade Banner
    public JPanel createUpgradeBanner() {
        JPanel banner = new JPanel(new BorderLayout(12, 0));
        banner.setBackground(ThemeColors.pillBg());
        banner.setBorder(BorderFactory.createCompoundBorder(
                new LineBorder(ThemeColors.cardBorder(), 1, true),
                new EmptyBorder(10, 16, 10, 16)
        ));

        upgradeBannerText.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        upgradeBannerText.setForeground(ThemeColors.textSecondary());
        banner.add(upgradeBannerText, BorderLayout.WEST);

        JButton btnUpgrade = UiFactory.createSecondaryButton("View Pricing & Features");
        btnUpgrade.setFont(new Font("Segoe UI", Font.BOLD, 11));
        btnUpgrade.addActionListener(e -> {
            try { Desktop.getDesktop().browse(new URI("https://takeoutfix.pages.dev/pricing")); } catch (Exception ignored) {}
        });
        banner.add(btnUpgrade, BorderLayout.EAST);

        ThemeColors.addThemeListener(() -> {
            banner.setBackground(ThemeColors.pillBg());
            banner.setBorder(BorderFactory.createCompoundBorder(
                    new LineBorder(ThemeColors.cardBorder(), 1, true),
                    new EmptyBorder(10, 16, 10, 16)
            ));
            upgradeBannerText.setForeground(ThemeColors.textSecondary());
        });

        return banner;
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
            if (!userService.isSignedIn()) {
                Window win = SwingUtilities.getWindowAncestor(this);
                Frame frame = (win instanceof Frame) ? (Frame) win : null;
                new SignInDialog(frame, userService).setVisible(true);
                return;
            }
            if (onStartCallback != null) onStartCallback.run();
        });
        btnPause.addActionListener(e -> {
            if (onPauseCallback != null) onPauseCallback.run();
        });
        btnCancel.addActionListener(e -> {
            if (onCancelCallback != null) onCancelCallback.run();
        });
        btnOpenFolder.addActionListener(e -> {
            if (onOpenFolderCallback != null) onOpenFolderCallback.run();
        });
    }

    public void updatePlanBadge() {
        SwingUtilities.invokeLater(() -> {
            if (dashboardPanel != null) {
                dashboardPanel.updateUserData();
            }

            boolean signedIn = userService.isSignedIn();
            boolean exceeded = signedIn && userService.isQuotaExceeded();
            if (quotaAlertBanner != null) {
                quotaAlertBanner.setVisible(exceeded);
            }

            if (!signedIn) {
                btnStart.setEnabled(false);
                btnStart.setText("Sign In to Start");
                upgradeBannerText.setText("Authentication Required: Please sign in with your Google or Email account.");
                String sel = (String) moduleSelect.getSelectedItem();
                if (sel != null && !sel.equals(CARD_DASHBOARD)) {
                    cardLayout.show(centerCards, CARD_AUTH_REQUIRED);
                }
                revalidate();
                repaint();
                return;
            }

            btnStart.setEnabled(true);
            btnStart.setText("Start Restoration");
            String sel = (String) moduleSelect.getSelectedItem();
            if (sel != null) {
                if (!sel.equals(CARD_RESTORE) && !sel.equals(CARD_DASHBOARD) && !userService.isFeaturesUnlocked()) {
                    cardLayout.show(centerCards, CARD_LOCKED);
                } else {
                    cardLayout.show(centerCards, sel);
                }
            }

            String plan = userService.getCurrentPlan();
            if ("super".equalsIgnoreCase(plan)) {
                upgradeBannerText.setText("Super Plan Active - Unlimited restorations and priority features unlocked.");
            } else if ("pro".equalsIgnoreCase(plan)) {
                upgradeBannerText.setText("Pro Plan Active - Unlimited restorations for 2 devices.");
            } else if (userService.isFreeUnlimited()) {
                upgradeBannerText.setText("Special Promotion Active - Free Unlimited restorations unlocked!");
            } else {
                upgradeBannerText.setText("Free Tier: 250 files / 500 MB limit. Upgrade to Pro for unlimited restorations.");
            }
            revalidate();
            repaint();
        });
    }

    private JPanel createQuotaAlertBanner() {
        JPanel banner = new JPanel(new BorderLayout(14, 0));
        banner.setBackground(new Color(254, 242, 242));
        banner.setBorder(BorderFactory.createCompoundBorder(
                new LineBorder(new Color(248, 113, 113), 1, true),
                new EmptyBorder(8, 14, 8, 14)
        ));

        JLabel iconAndText = new JLabel("⚠️ Free Tier Quota Exceeded (250 files / 500 MB limit). Upgrade to Pro or Super to unlock unlimited processing.");
        iconAndText.setFont(new Font("Segoe UI", Font.BOLD, 12));
        iconAndText.setForeground(new Color(185, 28, 28));
        banner.add(iconAndText, BorderLayout.CENTER);

        JButton btnUpgrade = UiFactory.createPrimaryButton("Upgrade Now ⚡");
        btnUpgrade.setFont(new Font("Segoe UI", Font.BOLD, 11));
        btnUpgrade.setPreferredSize(new Dimension(130, 32));
        btnUpgrade.addActionListener(e -> {
            try { Desktop.getDesktop().browse(new URI("https://takeoutfix.pages.dev/pricing")); } catch (Exception ignored) {}
        });
        banner.add(btnUpgrade, BorderLayout.EAST);

        ThemeColors.addThemeListener(() -> {
            if (ThemeColors.isDark()) {
                banner.setBackground(new Color(60, 20, 20));
                banner.setBorder(BorderFactory.createCompoundBorder(
                        new LineBorder(new Color(220, 38, 38), 1, true),
                        new EmptyBorder(8, 14, 8, 14)
                ));
                iconAndText.setForeground(new Color(252, 165, 165));
            } else {
                banner.setBackground(new Color(254, 242, 242));
                banner.setBorder(BorderFactory.createCompoundBorder(
                        new LineBorder(new Color(248, 113, 113), 1, true),
                        new EmptyBorder(8, 14, 8, 14)
                ));
                iconAndText.setForeground(new Color(185, 28, 28));
            }
        });

        banner.setVisible(false);
        return banner;
    }

    private void setSourceFile(File sel) {
        if (sel == null || !sel.exists()) return;
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
                            if (f.isFile()) bytes += f.length();
                        }
                    }
                    return String.format("✓ %s (%d items, %s)", sel.getName(), count, formatBytes(bytes));
                } else {
                    return String.format("✓ %s (Archive, %s)", sel.getName(), formatBytes(sel.length()));
                }
            }

            @Override
            protected void done() {
                try {
                    String info = get();
                    sourcePathLabel.setText(info);
                } catch (Exception ignored) {}
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

    private void setDestinationFile(File sel) {
        if (sel == null) return;
        File dir = sel.isDirectory() ? sel : sel.getParentFile();
        if (dir == null || !dir.exists()) return;
        selectedOutputPath = dir.getAbsolutePath();
        outputPathLabel.setText("✓ " + selectedOutputPath);
        outputPathLabel.setForeground(ThemeColors.textPrimary());
        outputPathLabel.setToolTipText(selectedOutputPath);
        btnDestClear.setVisible(true);
        consoleCard.appendLog("INFO", "Selected destination directory: " + selectedOutputPath);
    }

    private void clearDestination() {
        selectedOutputPath = "";
        outputPathLabel.setText("No destination folder selected yet");
        outputPathLabel.setForeground(ThemeColors.textMuted());
        outputPathLabel.setToolTipText(null);
        btnDestClear.setVisible(false);
    }

    private static String formatBytes(long bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return String.format("%.1f KB", bytes / 1024.0);
        if (bytes < 1024 * 1024 * 1024L) return String.format("%.1f MB", bytes / (1024.0 * 1024.0));
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
        SwingUtilities.invokeLater(() -> {
            btnStart.setEnabled(!running);
            btnPause.setEnabled(running);
            btnPause.setText(paused ? "Resume" : "Pause");
            btnCancel.setEnabled(running);
            btnOpenFolder.setEnabled(!running);
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

    public void setProgress(int percent, String message) {
        SwingUtilities.invokeLater(() -> {
            progressBar.setValue(percent);
            progressPercentLabel.setText(percent + "%");
            progressStatusLabel.setText(message);
        });
    }

    public void setProgressTelemetry(int percent, String message, long elapsedSec, long etaSec, double filesPerSec, double mbPerSec) {
        SwingUtilities.invokeLater(() -> {
            progressBar.setValue(percent);
            progressPercentLabel.setText(percent + "%");
            progressStatusLabel.setText(message);

            String elapsedStr = formatDuration(elapsedSec);
            String etaStr = (etaSec > 0 && percent < 100) ? formatDuration(etaSec) : (percent >= 100 ? "00:00" : "--:--");
            elapsedLabel.setText("⏱ Elapsed: " + elapsedStr);
            speedLabel.setText(String.format(java.util.Locale.US, "⚡ %.1f files/s • %.1f MB/s", filesPerSec, mbPerSec));
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
        return upgradeBannerPanel;
    }

    public void switchTo(String cardName) {
        SwingUtilities.invokeLater(() -> {
            if (moduleSelect != null) {
                moduleSelect.setSelectedItem(cardName);
            }
        });
    }

    public DashboardPanel getDashboardPanel() {
        return dashboardPanel;
    }

    public NetworkMonitorService getNetService() {
        return netService;
    }
}
