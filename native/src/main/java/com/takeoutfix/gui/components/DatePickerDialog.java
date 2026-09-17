package com.takeoutfix.gui.components;

import com.takeoutfix.gui.theme.ThemeColors;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import javax.swing.border.LineBorder;
import java.awt.*;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.function.Consumer;

/**
 * Clean, lightweight Swing calendar datepicker dialog.
 * Allows picking any date with month/year navigation, "Today", and "Clear".
 */
public class DatePickerDialog extends JDialog {

    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private LocalDate selectedDate;
    private YearMonth currentYearMonth;
    private final JPanel daysPanel = new JPanel(new GridLayout(7, 7, 4, 4));
    private final JLabel monthYearLabel = new JLabel("", SwingConstants.CENTER);
    private final Consumer<String> onDateSelected;

    public DatePickerDialog(Component parent, String initialDate, Consumer<String> onDateSelected) {
        super(SwingUtilities.getWindowAncestor(parent), "Select Archive Fallback Date", ModalityType.APPLICATION_MODAL);
        this.onDateSelected = onDateSelected;

        try {
            selectedDate = (initialDate != null && !initialDate.trim().isEmpty())
                    ? LocalDate.parse(initialDate.trim(), FORMATTER)
                    : LocalDate.now();
        } catch (Exception e) {
            selectedDate = LocalDate.now();
        }
        currentYearMonth = YearMonth.from(selectedDate);

        setSize(360, 380);
        setResizable(false);
        setLocationRelativeTo(parent);
        getContentPane().setBackground(ThemeColors.cardBg());
        setLayout(new BorderLayout(0, 10));

        JPanel container = new JPanel(new BorderLayout(0, 12));
        container.setOpaque(false);
        container.setBorder(new EmptyBorder(16, 16, 16, 16));

        // 1. Month / Year Header with Navigation
        JPanel header = new JPanel(new BorderLayout(8, 0));
        header.setOpaque(false);

        JButton btnPrev = UiFactory.createSecondaryButton(" < ");
        btnPrev.setMargin(new Insets(2, 6, 2, 6));
        btnPrev.addActionListener(e -> {
            currentYearMonth = currentYearMonth.minusMonths(1);
            refreshCalendar();
        });
        header.add(btnPrev, BorderLayout.WEST);

        monthYearLabel.setFont(new Font("Segoe UI", Font.BOLD, 14));
        monthYearLabel.setForeground(ThemeColors.textPrimary());
        header.add(monthYearLabel, BorderLayout.CENTER);

        JButton btnNext = UiFactory.createSecondaryButton(" > ");
        btnNext.setMargin(new Insets(2, 6, 2, 6));
        btnNext.addActionListener(e -> {
            currentYearMonth = currentYearMonth.plusMonths(1);
            refreshCalendar();
        });
        header.add(btnNext, BorderLayout.EAST);
        container.add(header, BorderLayout.NORTH);

        // 2. Calendar Days Grid
        daysPanel.setOpaque(false);
        container.add(daysPanel, BorderLayout.CENTER);

        // 3. Bottom Actions: Today, Clear, Cancel
        JPanel bottomBar = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 0));
        bottomBar.setOpaque(false);

        JButton btnToday = UiFactory.createSecondaryButton("Today");
        btnToday.addActionListener(e -> {
            selectedDate = LocalDate.now();
            onDateSelected.accept(selectedDate.format(FORMATTER));
            dispose();
        });
        bottomBar.add(btnToday);

        JButton btnClear = UiFactory.createSecondaryButton("Clear");
        btnClear.addActionListener(e -> {
            onDateSelected.accept("");
            dispose();
        });
        bottomBar.add(btnClear);

        JButton btnCancel = UiFactory.createSecondaryButton("Cancel");
        btnCancel.addActionListener(e -> dispose());
        bottomBar.add(btnCancel);

        container.add(bottomBar, BorderLayout.SOUTH);
        add(container, BorderLayout.CENTER);

        refreshCalendar();
    }

    private void refreshCalendar() {
        monthYearLabel.setText(currentYearMonth.getMonth().name() + " " + currentYearMonth.getYear());
        daysPanel.removeAll();

        // Weekday headers
        String[] daysOfWeek = {"Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"};
        for (String day : daysOfWeek) {
            JLabel lbl = new JLabel(day, SwingConstants.CENTER);
            lbl.setFont(new Font("Segoe UI", Font.BOLD, 11));
            lbl.setForeground(ThemeColors.textMuted());
            daysPanel.add(lbl);
        }

        LocalDate firstOfMonth = currentYearMonth.atDay(1);
        int dayOfWeekOffset = firstOfMonth.getDayOfWeek().getValue() % 7; // Sunday = 0
        int daysInMonth = currentYearMonth.lengthOfMonth();

        // Blank slots before start of month
        for (int i = 0; i < dayOfWeekOffset; i++) {
            daysPanel.add(new JLabel(""));
        }

        // Days of the month
        LocalDate today = LocalDate.now();
        for (int day = 1; day <= daysInMonth; day++) {
            LocalDate date = currentYearMonth.atDay(day);
            JButton btnDay = new JButton(String.valueOf(day));
            btnDay.setFont(new Font("Segoe UI", Font.PLAIN, 12));
            btnDay.setFocusPainted(false);
            btnDay.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
            btnDay.setMargin(new Insets(2, 2, 2, 2));

            boolean isSelected = date.equals(selectedDate);
            boolean isToday = date.equals(today);

            if (isSelected) {
                btnDay.setBackground(ThemeColors.accent());
                btnDay.setForeground(Color.WHITE);
                btnDay.setBorder(new EmptyBorder(4, 4, 4, 4));
            } else if (isToday) {
                btnDay.setBackground(ThemeColors.pillBg());
                btnDay.setForeground(ThemeColors.accent());
                btnDay.setBorder(new LineBorder(ThemeColors.accent(), 1, true));
            } else {
                btnDay.setBackground(ThemeColors.cardBg());
                btnDay.setForeground(ThemeColors.textPrimary());
                btnDay.setBorder(new LineBorder(ThemeColors.cardBorder(), 1, true));
            }

            btnDay.addActionListener(e -> {
                selectedDate = date;
                onDateSelected.accept(selectedDate.format(FORMATTER));
                dispose();
            });

            daysPanel.add(btnDay);
        }

        // Fill remaining slots
        int totalCells = dayOfWeekOffset + daysInMonth;
        for (int i = totalCells; i < 42; i++) {
            daysPanel.add(new JLabel(""));
        }

        daysPanel.revalidate();
        daysPanel.repaint();
    }
}
