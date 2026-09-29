package com.photovault.ui.fx;

import com.photovault.model.DiscrepancyType;
import com.photovault.model.VerificationDiscrepancy;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * Tabular Audit Log and Verification Inspector card.
 * Displays real-time discovery events, streaming hash comparisons, and discrepancy records.
 */
public class AuditTableCard extends VBox {

    public record AuditLogEntry(
            String timestamp,
            String category,
            String status,
            String badgeClass,
            String targetPath,
            String size,
            String details,
            boolean isDiscrepancy
    ) {}

    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("HH:mm:ss");

    private final ComboBox<String> filterCombo;
    private final Label countBadge;
    private final TableView<AuditLogEntry> logsTable;
    private final ObservableList<AuditLogEntry> masterList = FXCollections.observableArrayList();
    private final ObservableList<AuditLogEntry> displayedList = FXCollections.observableArrayList();

    public AuditTableCard() {
        super(8);
        getStyleClass().add("glass-card");

        // Top Header Row
        HBox top = new HBox(10);
        top.setAlignment(Pos.CENTER_LEFT);

        Label label = new Label("Audit Log & Verification Inspector");
        label.getStyleClass().add("text-primary");
        label.setStyle("-fx-font-size: 13px; -fx-font-weight: 600;");

        countBadge = new Label("0 EVENTS");
        countBadge.getStyleClass().add("badge-pv");
        countBadge.setStyle("-fx-font-size: 10px; -fx-padding: 2 6 2 6;");

        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);

        filterCombo = new ComboBox<>();
        filterCombo.getItems().addAll(
                "All Audit Events",
                "Issues & Discrepancies Only",
                "File & Folder Activities",
                "Engine Milestones"
        );
        filterCombo.setValue("All Audit Events");
        filterCombo.setOnAction(e -> applyFilter());

        Button clearBtn = new Button("Clear Log");
        clearBtn.getStyleClass().add("btn-secondary");
        clearBtn.setStyle("-fx-font-size: 11px; -fx-padding: 4 10 4 10;");
        clearBtn.setOnAction(e -> clear());

        top.getChildren().addAll(label, countBadge, sp, filterCombo, clearBtn);

        // Tabular Audit Logs Table
        logsTable = new TableView<>();
        logsTable.setItems(displayedList);
        logsTable.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY);
        VBox.setVgrow(logsTable, Priority.ALWAYS);

        // Column 1: Time
        TableColumn<AuditLogEntry, String> colTime = new TableColumn<>("Time");
        colTime.setCellValueFactory(c -> new SimpleStringProperty(c.getValue().timestamp()));
        colTime.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                } else {
                    setText(item);
                    setAlignment(Pos.CENTER);
                }
            }
        });
        colTime.setPrefWidth(90);
        colTime.setMaxWidth(100);

        // Column 2: Status / Event Badge
        TableColumn<AuditLogEntry, AuditLogEntry> colStatus = new TableColumn<>("Status / Event");
        colStatus.setCellValueFactory(c -> new javafx.beans.property.SimpleObjectProperty<>(c.getValue()));
        colStatus.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(AuditLogEntry item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    Label badge = new Label(item.status());
                    badge.getStyleClass().add(item.badgeClass());
                    setGraphic(badge);
                    setText(null);
                    setAlignment(Pos.CENTER_LEFT);
                }
            }
        });
        colStatus.setPrefWidth(170);

        // Column 3: Target Path / Scope
        TableColumn<AuditLogEntry, String> colPath = new TableColumn<>("Target / Relative Path");
        colPath.setCellValueFactory(c -> new SimpleStringProperty(c.getValue().targetPath()));
        colPath.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setTooltip(null);
                } else {
                    setText(item);
                    setTooltip(new Tooltip(item));
                    setAlignment(Pos.CENTER_LEFT);
                }
            }
        });
        colPath.setPrefWidth(280);

        // Column 4: Size / Rate
        TableColumn<AuditLogEntry, String> colSize = new TableColumn<>("Size / Rate");
        colSize.setCellValueFactory(c -> new SimpleStringProperty(c.getValue().size()));
        colSize.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                } else {
                    setText(item);
                    setAlignment(Pos.CENTER_RIGHT);
                }
            }
        });
        colSize.setPrefWidth(95);

        // Column 5: Audit Log Details
        TableColumn<AuditLogEntry, String> colDetails = new TableColumn<>("Audit Details");
        colDetails.setCellValueFactory(c -> new SimpleStringProperty(c.getValue().details()));
        colDetails.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setTooltip(null);
                } else {
                    setText(item);
                    setTooltip(new Tooltip(item));
                }
            }
        });
        colDetails.setPrefWidth(300);

        logsTable.getColumns().addAll(colTime, colStatus, colPath, colSize, colDetails);

        // Placeholder for initial idle state
        VBox placeholderBox = new VBox(6);
        placeholderBox.setAlignment(Pos.CENTER);
        Label p1 = new Label("Ready to Verify");
        p1.getStyleClass().add("text-primary");
        p1.setStyle("-fx-font-size: 13px; -fx-font-weight: 600;");
        Label p2 = new Label("Select original and backup folders. Scanned files, hash matches, and discrepancies stream here in tabular format.");
        p2.getStyleClass().add("text-muted");
        p2.setStyle("-fx-font-size: 11px;");
        placeholderBox.getChildren().addAll(p1, p2);
        logsTable.setPlaceholder(placeholderBox);

        getChildren().addAll(top, logsTable);
    }

    public void addLog(String category, String status, String badgeClass, String targetPath, String size, String details) {
        addLog(category, status, badgeClass, targetPath, size, details, false);
    }

    public void addLog(String category, String status, String badgeClass, String targetPath, String size, String details, boolean isDiscrepancy) {
        String now = LocalTime.now().format(TIME_FMT);
        AuditLogEntry entry = new AuditLogEntry(now, category, status, badgeClass, targetPath, size, details, isDiscrepancy);
        masterList.add(entry);
        updateCountBadge();
        applyFilter();
    }

    public void addDiscrepancy(VerificationDiscrepancy d) {
        String issueName = getFriendlyIssueName(d.type());
        String badgeClass = getIssueBadgeClass(d.type());
        String sizeStr = (d.originalSize() != null && d.originalSize() >= 0) ? FormatUtils.formatBytes(d.originalSize()) : "—";
        addLog("DISCREPANCY", issueName, badgeClass, d.relativePath(), sizeStr, d.message() != null ? d.message() : issueName, true);
    }

    public void setDiscrepancies(List<VerificationDiscrepancy> list) {
        for (VerificationDiscrepancy d : list) {
            addDiscrepancy(d);
        }
    }

    public int getDiscrepancyCount() {
        int count = 0;
        for (AuditLogEntry e : masterList) {
            if (e.isDiscrepancy()) count++;
        }
        return count;
    }

    public void clear() {
        masterList.clear();
        displayedList.clear();
        updateCountBadge();
    }

    private void updateCountBadge() {
        int total = masterList.size();
        int issues = getDiscrepancyCount();
        if (issues > 0) {
            countBadge.setText(issues + " ISSUES / " + total + " EVENTS");
            countBadge.getStyleClass().removeAll("badge-pv", "badge-source", "badge-backup", "badge-hash-mismatch");
            countBadge.getStyleClass().add("badge-hash-mismatch");
        } else {
            countBadge.setText(total + " EVENTS");
            countBadge.getStyleClass().removeAll("badge-pv", "badge-source", "badge-backup", "badge-hash-mismatch");
            countBadge.getStyleClass().add("badge-pv");
        }
    }

    private void applyFilter() {
        String filter = filterCombo.getValue();
        if (filter == null || filter.equals("All Audit Events")) {
            displayedList.setAll(masterList);
            return;
        }

        List<AuditLogEntry> filtered = new ArrayList<>();
        for (AuditLogEntry e : masterList) {
            if (filter.equals("Issues & Discrepancies Only")) {
                if (e.isDiscrepancy()) filtered.add(e);
            } else if (filter.equals("File & Folder Activities")) {
                if ("SOURCE".equals(e.category()) || "BACKUP".equals(e.category()) || "SCAN".equals(e.category())) {
                    filtered.add(e);
                }
            } else if (filter.equals("Engine Milestones")) {
                if ("MILESTONE".equals(e.category()) || "STATUS".equals(e.category())) {
                    filtered.add(e);
                }
            }
        }
        displayedList.setAll(filtered);
    }

    private static String getFriendlyIssueName(DiscrepancyType type) {
        if (type == null) return "Unknown";
        return switch (type) {
            case HASH_MISMATCH -> "Content Damaged";
            case MISSING_IN_BACKUP -> "Missing in Backup";
            case EXTRA_IN_BACKUP -> "Extra File";
            case SIZE_MISMATCH -> "Size Mismatch";
            case READ_ERROR -> "Disk Read Error";
            case UNSTABLE_FILE -> "Concurrently Modified";
        };
    }

    private static String getIssueBadgeClass(DiscrepancyType type) {
        if (type == null) return "badge-read-error";
        return switch (type) {
            case HASH_MISMATCH -> "badge-hash-mismatch";
            case MISSING_IN_BACKUP -> "badge-missing-backup";
            case EXTRA_IN_BACKUP -> "badge-missing-original";
            case SIZE_MISMATCH -> "badge-size-mismatch";
            case READ_ERROR, UNSTABLE_FILE -> "badge-read-error";
        };
    }
}
