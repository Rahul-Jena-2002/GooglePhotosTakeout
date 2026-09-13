package com.rahul.gui.components;

import com.rahul.gui.theme.ThemeColors;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import javax.swing.border.LineBorder;
import javax.swing.text.BadLocationException;
import javax.swing.text.Style;
import javax.swing.text.StyleConstants;
import javax.swing.text.StyledDocument;
import java.awt.*;
import java.awt.datatransfer.StringSelection;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Modern, high-contrast Terminal Logs panel matching developer tools.
 * Supports interactive tab navigation & filtering across All, Restored, Errors, and Skipped.
 */
public class ConsoleCard extends JPanel {

    public enum LogCategory {
        ALL,
        RESTORED,
        ERRORS,
        SKIPPED
    }

    public static class LogEntry {
        private final String timestamp;
        private final String level;
        private final String message;
        private final LogCategory category;

        public LogEntry(String timestamp, String level, String message, LogCategory category) {
            this.timestamp = timestamp;
            this.level = level;
            this.message = message;
            this.category = category;
        }

        public String getTimestamp() { return timestamp; }
        public String getLevel() { return level; }
        public String getMessage() { return message; }
        public LogCategory getCategory() { return category; }
    }

    private final JTextPane consolePane;
    private final StyledDocument consoleDoc;
    private final JScrollPane scroll;
    private final JLabel titleLabel;

    private final List<LogEntry> allLogs = Collections.synchronizedList(new ArrayList<>());
    private volatile LogCategory activeFilter = LogCategory.ALL;

    private int allCount = 0;
    private int restoredCount = 0;
    private int errorsCount = 0;
    private int skippedCount = 0;

    private final FilterPill pillAll;
    private final FilterPill pillRestored;
    private final FilterPill pillErrors;
    private final FilterPill pillSkipped;

    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("HH:mm:ss");

    public ConsoleCard() {
        super(new BorderLayout(8, 8));
        updateCardTheme();

        // Terminal Console Area
        consolePane = new JTextPane();
        consolePane.setEditable(false);
        consolePane.setBackground(new Color(11, 15, 25)); // Deep modern slate terminal
        consolePane.setForeground(new Color(226, 232, 240));
        consolePane.setFont(new Font("Consolas", Font.PLAIN, 12));
        consolePane.setBorder(new EmptyBorder(12, 16, 12, 16));
        consoleDoc = consolePane.getStyledDocument();

        // Header with macOS-style dots, title, pills, and action buttons
        JPanel header = new JPanel(new BorderLayout(10, 0));
        header.setOpaque(false);

        JPanel leftFilters = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
        leftFilters.setOpaque(false);

        // Terminal window dots
        JPanel dots = new JPanel(new FlowLayout(FlowLayout.LEFT, 5, 0));
        dots.setOpaque(false);
        dots.add(createDot(new Color(239, 68, 68)));  // Red
        dots.add(createDot(new Color(245, 158, 11))); // Yellow
        dots.add(createDot(new Color(16, 185, 129))); // Green
        leftFilters.add(dots);
        leftFilters.add(Box.createHorizontalStrut(4));

        titleLabel = new JLabel("RESTORE LOGS & DIAGNOSTICS");
        titleLabel.setFont(new Font("Segoe UI", Font.BOLD, 11));
        titleLabel.setForeground(ThemeColors.textSecondary());
        leftFilters.add(titleLabel);
        leftFilters.add(Box.createHorizontalStrut(8));

        // Interactive Filter Pills
        pillAll = new FilterPill("All (0)", LogCategory.ALL);
        pillRestored = new FilterPill("Restored (0)", LogCategory.RESTORED);
        pillErrors = new FilterPill("Errors (0)", LogCategory.ERRORS);
        pillSkipped = new FilterPill("Skipped (0)", LogCategory.SKIPPED);

        leftFilters.add(pillAll);
        leftFilters.add(pillRestored);
        leftFilters.add(pillErrors);
        leftFilters.add(pillSkipped);
        header.add(leftFilters, BorderLayout.WEST);

        JPanel rightActions = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 0));
        rightActions.setOpaque(false);

        JButton copyBtn = UiFactory.createSecondaryButton("Copy Logs");
        copyBtn.setFont(new Font("Segoe UI", Font.BOLD, 11));
        copyBtn.setToolTipText("Copy currently visible filtered logs to clipboard");
        copyBtn.addActionListener(e -> copyLogsToClipboard());
        rightActions.add(copyBtn);

        JButton clearBtn = UiFactory.createSecondaryButton("Clear Logs");
        clearBtn.setFont(new Font("Segoe UI", Font.BOLD, 11));
        clearBtn.setToolTipText("Clear all recorded logs");
        clearBtn.addActionListener(e -> clearLogs());
        rightActions.add(clearBtn);
        header.add(rightActions, BorderLayout.EAST);

        add(header, BorderLayout.NORTH);

        scroll = new JScrollPane(consolePane);
        scroll.setMinimumSize(new Dimension(0, 180));
        scroll.setPreferredSize(new Dimension(0, 280));
        scroll.setBorder(new LineBorder(ThemeColors.cardBorder(), 1, true));
        scroll.setBackground(new Color(11, 15, 25));
        scroll.getVerticalScrollBar().setUnitIncrement(14);
        add(scroll, BorderLayout.CENTER);

        ThemeColors.addThemeListener(() -> {
            updateCardTheme();
            titleLabel.setForeground(ThemeColors.textSecondary());
            scroll.setBorder(new LineBorder(ThemeColors.cardBorder(), 1, true));
            updatePills();
            repaint();
        });
    }

    private JLabel createDot(Color color) {
        JLabel dot = new JLabel() {
            @Override
            protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(color);
                g2.fillOval(2, 4, 8, 8);
                g2.dispose();
            }
        };
        dot.setPreferredSize(new Dimension(14, 16));
        return dot;
    }

    private void updateCardTheme() {
        setBackground(ThemeColors.cardBg());
        setBorder(BorderFactory.createCompoundBorder(
                new LineBorder(ThemeColors.cardBorder(), 1, true),
                new EmptyBorder(12, 16, 12, 16)
        ));
    }

    public void appendLog(String level, String message) {
        String lvl = level != null ? level.toUpperCase().trim() : "INFO";
        LogCategory cat;
        if (lvl.contains("RESTORE") || lvl.contains("SUCCESS")) {
            cat = LogCategory.RESTORED;
        } else if (lvl.contains("ERR") || lvl.contains("FAIL") || lvl.contains("DANGER")) {
            cat = LogCategory.ERRORS;
        } else if (lvl.contains("SKIP")) {
            cat = LogCategory.SKIPPED;
        } else {
            cat = LogCategory.ALL;
        }

        String timestamp = "[" + LocalTime.now().format(TIME_FMT) + "] ";
        LogEntry entry = new LogEntry(timestamp, lvl, message, cat);
        allLogs.add(entry);

        SwingUtilities.invokeLater(() -> {
            allCount++;
            if (cat == LogCategory.RESTORED) restoredCount++;
            else if (cat == LogCategory.ERRORS) errorsCount++;
            else if (cat == LogCategory.SKIPPED) skippedCount++;

            updatePills();

            // If active filter matches this entry or active filter is ALL, append immediately
            if (activeFilter == LogCategory.ALL || activeFilter == cat) {
                // If console was showing empty notice, clear it first
                if (consolePane.getText().contains("[NO EVENTS RECORDED]")) {
                    consolePane.setText("");
                }
                insertEntryDirect(entry);
                consolePane.setCaretPosition(consoleDoc.getLength());
            }
        });
    }

    private void insertEntryDirect(LogEntry entry) {
        try {
            // Timestamp style (muted slate)
            Style tsStyle = consoleDoc.addStyle("TS_" + entry.getLevel(), null);
            StyleConstants.setForeground(tsStyle, new Color(100, 116, 139));
            consoleDoc.insertString(consoleDoc.getLength(), entry.getTimestamp(), tsStyle);

            // Level Tag style (colored)
            Style levelStyle = consoleDoc.addStyle(entry.getLevel(), null);
            Color color = switch (entry.getLevel()) {
                case "SUCCESS", "RESTORED" -> new Color(16, 185, 129); // Emerald
                case "INFO" -> new Color(56, 189, 248);                // Sky Blue
                case "WARN", "WARNING" -> new Color(245, 158, 11);     // Amber
                case "ERROR", "DANGER" -> new Color(248, 113, 113);    // Rose
                default -> new Color(129, 140, 248);                  // Indigo
            };
            StyleConstants.setForeground(levelStyle, color);
            StyleConstants.setBold(levelStyle, true);
            consoleDoc.insertString(consoleDoc.getLength(), "[" + entry.getLevel() + "] ", levelStyle);

            // Message text
            Style msgStyle = consoleDoc.addStyle("MSG_" + entry.getLevel(), null);
            StyleConstants.setForeground(msgStyle, new Color(241, 245, 249)); // Bright readable white/slate
            StyleConstants.setBold(msgStyle, false);
            consoleDoc.insertString(consoleDoc.getLength(), entry.getMessage() + "\n", msgStyle);
        } catch (BadLocationException ignored) {}
    }

    private void rebuildConsoleDocument() {
        consolePane.setText("");
        int rendered = 0;
        synchronized (allLogs) {
            for (LogEntry entry : allLogs) {
                if (activeFilter == LogCategory.ALL || entry.getCategory() == activeFilter) {
                    insertEntryDirect(entry);
                    rendered++;
                }
            }
        }

        if (rendered == 0) {
            String notice = switch (activeFilter) {
                case RESTORED -> "[NO EVENTS RECORDED] No restored photo/video records yet.\n";
                case ERRORS -> "[NO EVENTS RECORDED] No errors detected. System operations running smoothly.\n";
                case SKIPPED -> "[NO EVENTS RECORDED] No skipped files recorded.\n";
                case ALL -> "[NO EVENTS RECORDED] Ready for Google Takeout restoration operations.\n";
            };
            try {
                Style noticeStyle = consoleDoc.addStyle("NOTICE", null);
                StyleConstants.setForeground(noticeStyle, new Color(100, 116, 139));
                StyleConstants.setItalic(noticeStyle, true);
                consoleDoc.insertString(0, notice, noticeStyle);
            } catch (BadLocationException ignored) {}
        }

        consolePane.setCaretPosition(consoleDoc.getLength());
    }

    private void setActiveFilter(LogCategory filter) {
        if (this.activeFilter == filter) return;
        this.activeFilter = filter;
        updatePills();
        rebuildConsoleDocument();
    }

    private void updatePills() {
        pillAll.setText(" All (" + allCount + ") ");
        pillRestored.setText(" Restored (" + restoredCount + ") ");
        pillErrors.setText(" Errors (" + errorsCount + ") ");
        pillSkipped.setText(" Skipped (" + skippedCount + ") ");

        pillAll.repaint();
        pillRestored.repaint();
        pillErrors.repaint();
        pillSkipped.repaint();
    }

    private void clearLogs() {
        allLogs.clear();
        allCount = 0;
        restoredCount = 0;
        errorsCount = 0;
        skippedCount = 0;
        consolePane.setText("");
        updatePills();
    }

    private void copyLogsToClipboard() {
        String text = consolePane.getText();
        if (text == null || text.trim().isEmpty()) {
            JOptionPane.showMessageDialog(this, "No logs to copy for current filter: " + activeFilter.name(), "Notice", JOptionPane.INFORMATION_MESSAGE);
            return;
        }
        Toolkit.getDefaultToolkit().getSystemClipboard().setContents(new StringSelection(text), null);
        JOptionPane.showMessageDialog(this,
                "Copied " + activeFilter.name() + " logs to clipboard!",
                "Copied",
                JOptionPane.INFORMATION_MESSAGE);
    }

    // ─── Filter Pill Component ────────────────────────────────────────────────
    private class FilterPill extends JLabel {
        private final LogCategory category;
        private boolean isHovered = false;

        public FilterPill(String initialText, LogCategory category) {
            super(initialText, SwingConstants.CENTER);
            this.category = category;
            setOpaque(false);
            setFont(new Font("Segoe UI", Font.BOLD, 10));
            setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
            setBorder(new EmptyBorder(4, 10, 4, 10));
            setToolTipText("Filter console logs by " + category.name());

            addMouseListener(new MouseAdapter() {
                @Override
                public void mouseClicked(MouseEvent e) {
                    setActiveFilter(category);
                }

                @Override
                public void mouseEntered(MouseEvent e) {
                    isHovered = true;
                    repaint();
                }

                @Override
                public void mouseExited(MouseEvent e) {
                    isHovered = false;
                    repaint();
                }
            });
        }

        @Override
        protected void paintComponent(Graphics g) {
            Graphics2D g2 = (Graphics2D) g.create();
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

            boolean isActive = (activeFilter == category);
            Color bg;
            Color fg;

            if (isActive) {
                switch (category) {
                    case RESTORED -> bg = new Color(16, 185, 129); // Emerald
                    case ERRORS -> bg = new Color(239, 68, 68);    // Rose
                    case SKIPPED -> bg = new Color(245, 158, 11);  // Amber
                    default -> bg = ThemeColors.primaryButtonBg();  // Indigo
                }
                fg = Color.WHITE;
            } else if (isHovered) {
                bg = ThemeColors.isDark() ? new Color(42, 42, 56) : new Color(226, 232, 240);
                fg = ThemeColors.textPrimary();
            } else {
                bg = ThemeColors.pillBg();
                fg = ThemeColors.textMuted();
            }

            // Pill Background
            g2.setColor(bg);
            g2.fillRoundRect(0, 0, getWidth(), getHeight(), getHeight(), getHeight());

            // Outline for inactive pills
            if (!isActive) {
                g2.setColor(ThemeColors.cardBorder());
                g2.setStroke(new BasicStroke(1f));
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, getHeight(), getHeight());
            }

            g2.dispose();
            setForeground(fg);
            super.paintComponent(g);
        }
    }
}
