package com.takeoutfix.ui.fx;

import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.CheckBox;
import javafx.scene.control.Label;
import javafx.scene.control.Separator;
import javafx.scene.image.Image;
import javafx.scene.layout.*;
import javafx.stage.Modality;
import javafx.stage.Stage;
import javafx.stage.StageStyle;

import java.util.List;

/**
 * Clean, accessible dialog for customising TakeoutFix Dashboard layout.
 * Provides:
 * - Card visibility toggling (independent of order).
 * - Keyboard-accessible Move Up / Move Down buttons.
 * - Reset to Factory Default layout button.
 * - Live synchronization with DashboardLayoutStore.
 */
public class CustomizeDashboardDialog extends Stage {

    private final DashboardLayoutStore layoutStore;
    private final VBox cardListContainer = new VBox(10);

    public CustomizeDashboardDialog(Stage owner, DashboardLayoutStore layoutStore) {
        this.layoutStore = layoutStore;

        initOwner(owner);
        initModality(Modality.APPLICATION_MODAL);
        initStyle(StageStyle.DECORATED);
        setTitle("Customize Dashboard Layout");
        setResizable(false);
        applyWindowIcons();

        VBox root = new VBox(14);
        root.setPadding(new Insets(20, 24, 20, 24));
        root.setPrefWidth(520);
        root.getStyleClass().add("glass-card");

        // Header
        VBox headerBox = new VBox(4);
        Label titleLabel = new Label("Customize Dashboard Cards");
        titleLabel.getStyleClass().addAll("page-title", "text-primary");
        titleLabel.setStyle("-fx-font-size: 17px; -fx-font-weight: 800;");

        Label subtitleLabel = new Label("Toggle card visibility and reorder cards using the move buttons or drag handles.");
        subtitleLabel.getStyleClass().add("text-secondary");
        subtitleLabel.setStyle("-fx-font-size: 12px;");
        headerBox.getChildren().addAll(titleLabel, subtitleLabel);

        // Card List
        cardListContainer.setPadding(new Insets(6, 0, 6, 0));
        refreshList();

        // Footer Actions
        HBox footer = new HBox(12);
        footer.setAlignment(Pos.CENTER_RIGHT);
        footer.setPadding(new Insets(10, 0, 0, 0));

        Button btnReset = new Button("Reset to Default");
        btnReset.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-background-color: transparent; -fx-text-fill: #ef4444; -fx-border-color: rgba(239, 68, 68, 0.4); -fx-border-radius: 6; -fx-background-radius: 6; -fx-cursor: hand; -fx-padding: 6 14 6 14;");
        btnReset.setOnAction(e -> {
            layoutStore.resetToDefault();
            refreshList();
        });

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button btnClose = new Button("Done");
        btnClose.getStyleClass().add("btn-primary");
        btnClose.setStyle("-fx-font-size: 13px; -fx-font-weight: 700; -fx-padding: 6 22 6 22;");
        btnClose.setOnAction(e -> close());

        footer.getChildren().addAll(btnReset, spacer, btnClose);

        root.getChildren().addAll(headerBox, new Separator(), cardListContainer, new Separator(), footer);

        Scene scene = new Scene(root);
        if (owner != null && owner.getScene() != null) {
            scene.getStylesheets().addAll(owner.getScene().getStylesheets());
        } else {
            var css = getClass().getResource("/css/takeoutfix-dark.css");
            if (css != null) scene.getStylesheets().add(css.toExternalForm());
        }

        setScene(scene);

        // Keep list updated if changed externally
        layoutStore.addChangeListener(store -> refreshList());
    }

    private void refreshList() {
        cardListContainer.getChildren().clear();

        List<String> currentOrder = layoutStore.getActiveCardOrder();
        for (int i = 0; i < currentOrder.size(); i++) {
            String cardId = currentOrder.get(i);
            DashboardLayoutStore.CardDefinition def = layoutStore.getDefinition(cardId);
            if (def == null) continue;

            HBox cardRow = new HBox(12);
            cardRow.setAlignment(Pos.CENTER_LEFT);
            cardRow.setPadding(new Insets(10, 14, 10, 14));
            cardRow.setStyle("-fx-background-color: rgba(148, 163, 184, 0.08); -fx-background-radius: 6; -fx-border-color: rgba(148, 163, 184, 0.18); -fx-border-radius: 6;");

            // Checkbox for visibility
            CheckBox chk = new CheckBox();
            chk.setSelected(layoutStore.isCardVisible(cardId));
            chk.setOnAction(e -> layoutStore.setCardVisible(cardId, chk.isSelected()));

            // Text Info
            VBox textCol = new VBox(3);
            Label nameLbl = new Label(def.title());
            nameLbl.getStyleClass().add("text-primary");
            nameLbl.setStyle("-fx-font-size: 13px; -fx-font-weight: 700;");

            Label descLbl = new Label(def.subtitle());
            descLbl.getStyleClass().add("text-secondary");
            descLbl.setStyle("-fx-font-size: 11px;");
            textCol.getChildren().addAll(nameLbl, descLbl);

            Region spacer = new Region();
            HBox.setHgrow(spacer, Priority.ALWAYS);

            // Move Up Button
            Button btnUp = new Button();
            btnUp.setGraphic(UiIcons.createSvgIcon(UiIcons.CHEVRON_UP, 12, "currentColor"));
            btnUp.setDisable(i == 0);
            btnUp.setStyle("-fx-background-color: transparent; -fx-cursor: hand; -fx-padding: 4 6 4 6;");
            int finalI = i;
            btnUp.setOnAction(e -> {
                layoutStore.moveUp(cardId);
                refreshList();
            });

            // Move Down Button
            Button btnDown = new Button();
            btnDown.setGraphic(UiIcons.createSvgIcon(UiIcons.CHEVRON_DOWN, 12, "currentColor"));
            btnDown.setDisable(finalI == currentOrder.size() - 1);
            btnDown.setStyle("-fx-background-color: transparent; -fx-cursor: hand; -fx-padding: 4 6 4 6;");
            btnDown.setOnAction(e -> {
                layoutStore.moveDown(cardId);
                refreshList();
            });

            cardRow.getChildren().addAll(chk, textCol, spacer, btnUp, btnDown);
            cardListContainer.getChildren().add(cardRow);
        }
    }

    private void applyWindowIcons() {
        try {
            var iconStream = getClass().getResourceAsStream("/icons/icon.png");
            if (iconStream != null) {
                getIcons().add(new Image(iconStream));
            }
        } catch (Exception ignored) {}
    }
}
