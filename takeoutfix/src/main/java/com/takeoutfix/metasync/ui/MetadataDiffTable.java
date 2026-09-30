package com.takeoutfix.metasync.ui;

import com.takeoutfix.metasync.model.DiffStatus;
import com.takeoutfix.metasync.model.TagDifference;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.collections.transformation.FilteredList;
import javafx.collections.transformation.SortedList;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.control.cell.CheckBoxTableCell;
import javafx.scene.layout.HBox;

import java.util.List;

/**
 * Interactive JavaFX TableView for inspecting and selecting metadata tag differences.
 * Supports amber difference highlights, category groups, and filtered views.
 */
public class MetadataDiffTable extends TableView<TagDifference> {

    private final ObservableList<TagDifference> masterData = FXCollections.observableArrayList();
    private final FilteredList<TagDifference> filteredData = new FilteredList<>(masterData, p -> true);
    private String activeFilter = "ALL";

    public MetadataDiffTable() {
        getStyleClass().add("table-view");
        setStyle("-fx-background-color: #191A22; -fx-border-color: #30313B; -fx-border-radius: 8; -fx-background-radius: 8;");
        setFixedCellSize(40);
        setPlaceholder(new Label("Select a photo pair to view and compare metadata"));

        buildColumns();

        SortedList<TagDifference> sortedData = new SortedList<>(filteredData);
        sortedData.comparatorProperty().bind(comparatorProperty());
        setItems(sortedData);
    }

    private void buildColumns() {
        // 1. Sync Checkbox Column
        TableColumn<TagDifference, Boolean> selectCol = new TableColumn<>("Sync");
        selectCol.setPrefWidth(55);
        selectCol.setMinWidth(50);
        selectCol.setMaxWidth(60);
        selectCol.setCellValueFactory(cellData -> cellData.getValue().selectedProperty());
        selectCol.setCellFactory(CheckBoxTableCell.forTableColumn(selectCol));
        selectCol.setEditable(true);

        // 2. Metadata Field Name
        TableColumn<TagDifference, String> fieldCol = new TableColumn<>("Metadata Tag");
        fieldCol.setPrefWidth(170);
        fieldCol.setCellValueFactory(cellData -> new SimpleStringProperty(cellData.getValue().getDisplayName()));
        fieldCol.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    setText(item);
                    setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-text-fill: #E6E7ED;");
                }
            }
        });

        // 3. Category Group
        TableColumn<TagDifference, String> groupCol = new TableColumn<>("Group");
        groupCol.setPrefWidth(95);
        groupCol.setCellValueFactory(cellData -> new SimpleStringProperty(cellData.getValue().getGroup() != null ? cellData.getValue().getGroup().getDisplayName() : "General"));
        groupCol.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    Label badge = new Label(item);
                    badge.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-padding: 2 6 2 6; -fx-background-radius: 4; -fx-background-color: #20212B; -fx-text-fill: #989BA8;");
                    setGraphic(badge);
                    setText(null);
                }
            }
        });

        // 4. Source (RAW / Original) Value
        TableColumn<TagDifference, String> srcCol = new TableColumn<>("Source (RAW Original)");
        srcCol.setPrefWidth(210);
        srcCol.setCellValueFactory(cellData -> new SimpleStringProperty(cellData.getValue().getSourceValue()));
        srcCol.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    setText(item);
                    setStyle("-fx-font-size: 12px; -fx-text-fill: #E6E7ED;");
                }
            }
        });

        // 5. Destination (JPEG / Export) Value
        TableColumn<TagDifference, TagDifference> dstCol = new TableColumn<>("Destination (Export / XMP)");
        dstCol.setPrefWidth(210);
        dstCol.setCellValueFactory(cellData -> new javafx.beans.property.SimpleObjectProperty<>(cellData.getValue()));
        dstCol.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(TagDifference diff, boolean empty) {
                super.updateItem(diff, empty);
                if (empty || diff == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    String val = diff.getDestValue();
                    setText(val != null && !val.isBlank() ? val : "Missing");
                    if (diff.getStatus() == DiffStatus.DIFFERENT) {
                        setStyle("-fx-font-size: 12px; -fx-text-fill: #F59E0B; -fx-font-weight: 600;");
                    } else if (diff.getStatus() == DiffStatus.SOURCE_ONLY) {
                        setStyle("-fx-font-size: 12px; -fx-text-fill: #989BA8; -fx-font-style: italic;");
                    } else {
                        setStyle("-fx-font-size: 12px; -fx-text-fill: #E6E7ED;");
                    }
                }
            }
        });

        // 6. Status Badge
        TableColumn<TagDifference, DiffStatus> statusCol = new TableColumn<>("Status");
        statusCol.setPrefWidth(115);
        statusCol.setCellValueFactory(cellData -> new javafx.beans.property.SimpleObjectProperty<>(cellData.getValue().getStatus()));
        statusCol.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(DiffStatus status, boolean empty) {
                super.updateItem(status, empty);
                if (empty || status == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    Label badge = new Label(status.getLabel());
                    badge.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-padding: 2 7 2 7; -fx-background-radius: 4;");
                    switch (status) {
                        case MATCH -> badge.setStyle(badge.getStyle() + "; -fx-text-fill: #10B981; -fx-background-color: rgba(16, 185, 129, 0.12);");
                        case DIFFERENT -> badge.setStyle(badge.getStyle() + "; -fx-text-fill: #F59E0B; -fx-background-color: rgba(245, 158, 11, 0.12);");
                        case SOURCE_ONLY -> badge.setStyle(badge.getStyle() + "; -fx-text-fill: #3B82F6; -fx-background-color: rgba(59, 130, 246, 0.12);");
                        case DEST_ONLY -> badge.setStyle(badge.getStyle() + "; -fx-text-fill: #989BA8; -fx-background-color: rgba(152, 155, 168, 0.12);");
                    }
                    HBox box = new HBox(badge);
                    box.setAlignment(Pos.CENTER_LEFT);
                    setGraphic(box);
                    setText(null);
                }
            }
        });

        getColumns().clear();
        getColumns().addAll(selectCol, fieldCol, groupCol, srcCol, dstCol, statusCol);
        setEditable(true);
        setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY);
    }

    public void setTagDifferences(List<TagDifference> differences) {
        masterData.setAll(differences);
        applyFilter(activeFilter);
    }

    public void applyFilter(String filterKey) {
        this.activeFilter = filterKey;
        filteredData.setPredicate(diff -> {
            if ("DIFFERENCES".equalsIgnoreCase(filterKey)) {
                return diff.getStatus() == DiffStatus.DIFFERENT;
            } else if ("MISSING".equalsIgnoreCase(filterKey)) {
                return diff.getStatus() == DiffStatus.SOURCE_ONLY;
            } else if ("MATCHING".equalsIgnoreCase(filterKey)) {
                return diff.getStatus() == DiffStatus.MATCH;
            }
            return true; // ALL
        });
    }

    public void selectAll(boolean select) {
        for (TagDifference diff : filteredData) {
            diff.setSelected(select);
        }
    }

    public ObservableList<TagDifference> getAllItems() {
        return masterData;
    }
}
