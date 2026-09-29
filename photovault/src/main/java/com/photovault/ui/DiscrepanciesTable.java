package com.photovault.ui;

import com.photovault.model.DiscrepancyType;
import com.photovault.model.VerificationDiscrepancy;
import com.photovault.ui.theme.ThemeColors;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import javax.swing.table.AbstractTableModel;
import javax.swing.table.DefaultTableCellRenderer;
import java.awt.*;
import java.util.ArrayList;
import java.util.List;

/**
 * Filterable discrepancies table displaying differences between original and backup directories.
 * Styled with TakeoutFix glass card container, dark tables, and crisp borders.
 */
public class DiscrepanciesTable extends JPanel {

    private final DiscrepancyTableModel tableModel;
    private final JTable table;
    private final JComboBox<String> filterCombo;
    private final List<VerificationDiscrepancy> allDiscrepancies = new ArrayList<>();

    public DiscrepanciesTable() {
        setLayout(new BorderLayout(0, 10));
        setOpaque(false);
        setBorder(new EmptyBorder(16, 18, 16, 18));

        // Header controls (title + filter combo)
        JPanel controlPanel = new JPanel(new BorderLayout(8, 0));
        controlPanel.setOpaque(false);

        JLabel titleLabel = new JLabel("Audit Log & Discrepancies");
        titleLabel.setFont(new Font("Segoe UI", Font.BOLD, 13));
        titleLabel.setForeground(ThemeColors.textPrimary());

        filterCombo = new JComboBox<>(new String[]{
                "All Items", "Missing in Backup", "Extra in Backup", "Hash / Size Mismatches", "Read Errors"
        });
        filterCombo.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        filterCombo.setBackground(ThemeColors.inputBg());
        filterCombo.setForeground(ThemeColors.textPrimary());
        filterCombo.addActionListener(e -> applyFilter());

        controlPanel.add(titleLabel, BorderLayout.WEST);
        controlPanel.add(filterCombo, BorderLayout.EAST);

        // Table
        tableModel = new DiscrepancyTableModel();
        table = new JTable(tableModel);
        table.setFillsViewportHeight(true);
        table.setRowHeight(28);
        table.setShowGrid(true);
        table.setGridColor(ThemeColors.cardBorder());
        table.setBackground(ThemeColors.cardBg());
        table.setForeground(ThemeColors.textPrimary());
        table.setFont(new Font("Segoe UI", Font.PLAIN, 12));

        table.getTableHeader().setBackground(ThemeColors.pillBg());
        table.getTableHeader().setForeground(ThemeColors.textSecondary());
        table.getTableHeader().setFont(new Font("Segoe UI", Font.BOLD, 11));

        // Column widths
        table.getColumnModel().getColumn(0).setPreferredWidth(160);
        table.getColumnModel().getColumn(1).setPreferredWidth(320);
        table.getColumnModel().getColumn(2).setPreferredWidth(100);
        table.getColumnModel().getColumn(3).setPreferredWidth(100);

        // Custom Cell Renderer for Type badges and status coloring
        table.setDefaultRenderer(Object.class, new DefaultTableCellRenderer() {
            @Override
            public Component getTableCellRendererComponent(JTable tbl, Object value, boolean isSelected, boolean hasFocus, int row, int col) {
                Component c = super.getTableCellRendererComponent(tbl, value, isSelected, hasFocus, row, col);
                setBorder(new EmptyBorder(0, 8, 0, 8));

                if (!isSelected) {
                    c.setBackground(row % 2 == 0 ? ThemeColors.cardBg() : (ThemeColors.isDark() ? new Color(14, 18, 28) : new Color(241, 245, 249)));
                    if (col == 0) {
                        String typeStr = value != null ? value.toString() : "";
                        if (typeStr.contains("MISSING")) {
                            c.setForeground(ThemeColors.danger());
                        } else if (typeStr.contains("MISMATCH")) {
                            c.setForeground(ThemeColors.warning());
                        } else if (typeStr.contains("EXTRA")) {
                            c.setForeground(ThemeColors.accent());
                        } else {
                            c.setForeground(ThemeColors.textPrimary());
                        }
                    } else {
                        c.setForeground(ThemeColors.textSecondary());
                    }
                }
                return c;
            }
        });

        JScrollPane scrollPane = new JScrollPane(table);
        scrollPane.setBorder(BorderFactory.createLineBorder(ThemeColors.cardBorder(), 1));
        scrollPane.getViewport().setBackground(ThemeColors.cardBg());
        scrollPane.setPreferredSize(new Dimension(800, 220));

        ThemeColors.addThemeListener(() -> {
            titleLabel.setForeground(ThemeColors.textPrimary());
            filterCombo.setBackground(ThemeColors.inputBg());
            filterCombo.setForeground(ThemeColors.textPrimary());
            table.setGridColor(ThemeColors.cardBorder());
            table.setBackground(ThemeColors.cardBg());
            table.setForeground(ThemeColors.textPrimary());
            table.getTableHeader().setBackground(ThemeColors.pillBg());
            table.getTableHeader().setForeground(ThemeColors.textSecondary());
            scrollPane.setBorder(BorderFactory.createLineBorder(ThemeColors.cardBorder(), 1));
            scrollPane.getViewport().setBackground(ThemeColors.cardBg());
            repaint();
        });

        add(controlPanel, BorderLayout.NORTH);
        add(scrollPane, BorderLayout.CENTER);
    }

    @Override
    protected void paintComponent(Graphics g) {
        Graphics2D g2 = (Graphics2D) g.create();
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        int w = getWidth();
        int h = getHeight();
        if (w > 4 && h > 4) {
            boolean isDark = ThemeColors.isDark();
            int arc = 16;
            int shadowOffset = 3;

            Color sColor1 = isDark ? new Color(0, 0, 0, 75) : new Color(15, 23, 42, 12);
            g2.setColor(sColor1);
            g2.fillRoundRect(2, shadowOffset + 1, w - 4, h - shadowOffset - 2, arc + 2, arc + 2);

            Color topGlass = isDark ? new Color(22, 28, 42, 240) : new Color(255, 255, 255, 238);
            Color bottomGlass = isDark ? new Color(14, 18, 28, 235) : new Color(248, 250, 252, 220);
            GradientPaint glassGradient = new GradientPaint(0, 0, topGlass, 0, h, bottomGlass);
            g2.setPaint(glassGradient);
            g2.fillRoundRect(1, 1, w - 2, h - shadowOffset - 1, arc, arc);

            Color topBorder = isDark ? new Color(255, 255, 255, 45) : new Color(255, 255, 255, 235);
            Color bottomBorder = isDark ? new Color(42, 54, 76, 200) : new Color(203, 213, 225, 140);
            GradientPaint borderGradient = new GradientPaint(0, 0, topBorder, 0, h, bottomBorder);
            g2.setPaint(borderGradient);
            g2.drawRoundRect(1, 1, w - 3, h - shadowOffset - 2, arc, arc);
        }
        g2.dispose();
        super.paintComponent(g);
    }

    public void addDiscrepancy(VerificationDiscrepancy discrepancy) {
        allDiscrepancies.add(discrepancy);
        applyFilter();
    }

    public void setDiscrepancies(List<VerificationDiscrepancy> discrepancies) {
        allDiscrepancies.clear();
        allDiscrepancies.addAll(discrepancies);
        applyFilter();
    }

    public void clear() {
        allDiscrepancies.clear();
        tableModel.setItems(new ArrayList<>());
    }

    private void applyFilter() {
        int selectedIndex = filterCombo.getSelectedIndex();
        List<VerificationDiscrepancy> filtered = new ArrayList<>();

        for (VerificationDiscrepancy d : allDiscrepancies) {
            boolean match = switch (selectedIndex) {
                case 1 -> d.type() == DiscrepancyType.MISSING_IN_BACKUP;
                case 2 -> d.type() == DiscrepancyType.EXTRA_IN_BACKUP;
                case 3 -> d.type() == DiscrepancyType.HASH_MISMATCH || d.type() == DiscrepancyType.SIZE_MISMATCH;
                case 4 -> d.type() == DiscrepancyType.READ_ERROR;
                default -> true;
            };
            if (match) {
                filtered.add(d);
            }
        }
        tableModel.setItems(filtered);
    }

    private static class DiscrepancyTableModel extends AbstractTableModel {
        private final String[] columns = {"Discrepancy Type", "Relative Path", "Original Size", "Backup Size"};
        private List<VerificationDiscrepancy> items = new ArrayList<>();

        public void setItems(List<VerificationDiscrepancy> items) {
            this.items = items;
            fireTableDataChanged();
        }

        @Override
        public int getRowCount() {
            return items.size();
        }

        @Override
        public int getColumnCount() {
            return columns.length;
        }

        @Override
        public String getColumnName(int column) {
            return columns[column];
        }

        @Override
        public Object getValueAt(int rowIndex, int columnIndex) {
            if (rowIndex >= items.size()) return null;
            VerificationDiscrepancy d = items.get(rowIndex);
            return switch (columnIndex) {
                case 0 -> d.type().name();
                case 1 -> d.relativePath();
                case 2 -> d.originalSize() >= 0 ? formatSize(d.originalSize()) : "—";
                case 3 -> d.backupSize() >= 0 ? formatSize(d.backupSize()) : "—";
                default -> null;
            };
        }

        private String formatSize(long bytes) {
            if (bytes < 1024) return bytes + " B";
            if (bytes < 1024 * 1024) return String.format("%.1f KB", bytes / 1024.0);
            return String.format("%.2f MB", bytes / (1024.0 * 1024.0));
        }
    }
}
