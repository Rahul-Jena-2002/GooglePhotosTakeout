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
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;

/**
 * Modern, high-contrast Terminal Logs panel matching developer tools.
 * Clean, readable, spacious, and responsive.
 */
public class ConsoleCard extends JPanel {

    private final JTextPane consolePane;
    private final StyledDocument consoleDoc;
    private final JScrollPane scroll;
    private final JLabel titleLabel;

    private int allCount = 0;
    private int restoredCount = 0;
    private int errorsCount = 0;
    private int skippedCount = 0;

    private final JLabel pillAll;
    private final JLabel pillRestored;
    private final JLabel pillErrors;
    private final JLabel pillSkipped;
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

        pillAll = UiFactory.createBadge("All (0)", ThemeColors.primaryButtonBg(), ThemeColors.primaryButtonText());
        pillRestored = UiFactory.createBadge("Restored (0)", ThemeColors.pillBg(), ThemeColors.textMuted());
        pillErrors = UiFactory.createBadge("Errors (0)", ThemeColors.pillBg(), ThemeColors.textMuted());
        pillSkipped = UiFactory.createBadge("Skipped (0)", ThemeColors.pillBg(), ThemeColors.textMuted());

        leftFilters.add(pillAll);
        leftFilters.add(pillRestored);
        leftFilters.add(pillErrors);
        leftFilters.add(pillSkipped);
        header.add(leftFilters, BorderLayout.WEST);

        JPanel rightActions = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 0));
        rightActions.setOpaque(false);

        JButton copyBtn = UiFactory.createSecondaryButton("Copy Logs");
        copyBtn.setFont(new Font("Segoe UI", Font.BOLD, 11));
        copyBtn.addActionListener(e -> {
            String text = consolePane.getText();
            Toolkit.getDefaultToolkit().getSystemClipboard().setContents(new StringSelection(text), null);
            JOptionPane.showMessageDialog(this, "Logs copied to clipboard!", "Copied", JOptionPane.INFORMATION_MESSAGE);
        });
        rightActions.add(copyBtn);

        JButton clearBtn = UiFactory.createSecondaryButton("Clear Logs");
        clearBtn.setFont(new Font("Segoe UI", Font.BOLD, 11));
        clearBtn.addActionListener(e -> {
            consolePane.setText("");
            allCount = 0;
            restoredCount = 0;
            errorsCount = 0;
            skippedCount = 0;
            updatePills();
        });
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
        SwingUtilities.invokeLater(() -> {
            allCount++;
            String lvl = level.toUpperCase();
            if (lvl.contains("RESTORE") || lvl.contains("SUCCESS")) {
                restoredCount++;
            } else if (lvl.contains("ERR") || lvl.contains("FAIL")) {
                errorsCount++;
            } else if (lvl.contains("SKIP")) {
                skippedCount++;
            }
            updatePills();

            try {
                String timestamp = "[" + LocalTime.now().format(TIME_FMT) + "] ";

                // Timestamp style (muted slate)
                Style tsStyle = consoleDoc.addStyle("TS_" + level, null);
                StyleConstants.setForeground(tsStyle, new Color(100, 116, 139));
                consoleDoc.insertString(consoleDoc.getLength(), timestamp, tsStyle);

                // Level Tag style (colored)
                Style levelStyle = consoleDoc.addStyle(level, null);
                Color color = switch (lvl) {
                    case "SUCCESS", "RESTORED" -> new Color(16, 185, 129); // Emerald
                    case "INFO" -> new Color(56, 189, 248);                // Sky Blue
                    case "WARN", "WARNING" -> new Color(245, 158, 11);    // Amber
                    case "ERROR", "DANGER" -> new Color(248, 113, 113);    // Rose
                    default -> new Color(129, 140, 248);                  // Indigo
                };
                StyleConstants.setForeground(levelStyle, color);
                StyleConstants.setBold(levelStyle, true);
                consoleDoc.insertString(consoleDoc.getLength(), "[" + lvl + "] ", levelStyle);

                // Message text
                Style msgStyle = consoleDoc.addStyle("MSG_" + level, null);
                StyleConstants.setForeground(msgStyle, new Color(241, 245, 249)); // Bright readable white/slate
                StyleConstants.setBold(msgStyle, false);
                consoleDoc.insertString(consoleDoc.getLength(), message + "\n", msgStyle);

                consolePane.setCaretPosition(consoleDoc.getLength());
            } catch (BadLocationException ignored) {}
        });
    }

    private void updatePills() {
        pillAll.setText(" All (" + allCount + ") ");
        pillRestored.setText(" Restored (" + restoredCount + ") ");
        pillErrors.setText(" Errors (" + errorsCount + ") ");
        pillSkipped.setText(" Skipped (" + skippedCount + ") ");
    }
}
