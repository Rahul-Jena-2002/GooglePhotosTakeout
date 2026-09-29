package com.takeoutfix.metasync.ui;

import com.takeoutfix.metasync.model.DiffStatus;
import com.takeoutfix.metasync.model.TagDifference;
import javafx.beans.property.SimpleStringProperty;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.control.cell.CheckBoxTableCell;
import javafx.scene.layout.HBox;

/**
 * Interactive JavaFX TableView for inspecting and selecting metadata tag differences.
 */
public class MetadataDiffTable extends TableView<TagDifference> {

    public MetadataDiffTable() {
        getStyleClass().add("table-view");
        setPlaceholder(new Label("Select a photo pair to view and compare metadata"));

        buildColumns();
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
        fieldCol.setPrefWidth(160);
        fieldCol.setCellValueFactory(cellData -> new SimpleStringProperty(cellData.getValue().getDisplayName()));

        // 3. Category Group
        TableColumn<TagDifference, String> groupCol = new TableColumn<>("Group");
        groupCol.setPrefWidth(100);
        groupCol.setCellValueFactory(cellData -> new SimpleStringProperty(cellData.getValue().getGroup().getDisplayName()));

        // 4. Source (RAW / Original) Value
        TableColumn<TagDifference, String> srcCol = new TableColumn<>("Source (RAW / Original)");
        srcCol.setPrefWidth(220);
        srcCol.setCellValueFactory(cellData -> new SimpleStringProperty(cellData.getValue().getSourceValue()));

        // 5. Destination (JPEG / Export) Value
        TableColumn<TagDifference, String> dstCol = new TableColumn<>("Destination (Export)");
        dstCol.setPrefWidth(220);
        dstCol.setCellValueFactory(cellData -> new SimpleStringProperty(cellData.getValue().getDestValue()));

        // 6. Status Badge
        TableColumn<TagDifference, DiffStatus> statusCol = new TableColumn<>("Status");
        statusCol.setPrefWidth(110);
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
                    badge.getStyleClass().add("badge");
                    switch (status) {
                        case MATCH -> badge.getStyleClass().add("badge-match");
                        case DIFFERENT -> badge.getStyleClass().add("badge-diff");
                        case SOURCE_ONLY -> badge.getStyleClass().add("badge-source");
                        case DEST_ONLY -> badge.getStyleClass().add("badge-neutral");
                    }
                    HBox box = new HBox(badge);
                    box.setAlignment(Pos.CENTER_LEFT);
                    setGraphic(box);
                    setText(null);
                }
            }
        });

        getColumns().addAll(selectCol, fieldCol, groupCol, srcCol, dstCol, statusCol);
        setEditable(true);
        setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY);
    }

    public void selectAll(boolean select) {
        for (TagDifference diff : getItems()) {
            diff.setSelected(select);
        }
    }
}
