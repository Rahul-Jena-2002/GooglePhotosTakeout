package com.takeoutfix.ui.fx;

import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Cursor;
import javafx.scene.Node;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.Tooltip;
import javafx.scene.input.ClipboardContent;
import javafx.scene.input.DataFormat;
import javafx.scene.input.Dragboard;
import javafx.scene.input.TransferMode;
import javafx.scene.layout.*;
import javafx.util.Duration;

/**
 * Reusable card wrapper for draggable and customizable TakeoutFix Dashboard sections.
 * Features:
 * - Dedicated 6-dot grip handle to restrict dragging (preventing click-hijacking of child controls).
 * - Keyboard-accessible Move Up and Move Down actions.
 * - Non-destructive wrapping: child node hierarchy, event listeners, and bindings remain untouched.
 * - Dynamic drop indicator rendering (above/below insertion line).
 */
public class DashboardCard extends VBox {

    private static final DataFormat CARD_ID_FORMAT = new DataFormat("application/x-takeoutfix-card-id");

    private final String cardId;
    private final Node contentNode;
    private final DraggableCardGrid grid;
    private final DashboardLayoutStore layoutStore;

    private final HBox headerRow = new HBox(8);
    private final StackPane dropIndicatorAbove = new StackPane();
    private final StackPane dropIndicatorBelow = new StackPane();
    private final StackPane gripHandle = new StackPane();
    private final Button btnMoveUp = new Button();
    private final Button btnMoveDown = new Button();
    private final Button btnHide = new Button();

    public DashboardCard(String cardId,
                         String title,
                         Node contentNode,
                         DraggableCardGrid grid,
                         DashboardLayoutStore layoutStore) {
        this.cardId = cardId;
        this.contentNode = contentNode;
        this.grid = grid;
        this.layoutStore = layoutStore;

        setSpacing(6);
        getStyleClass().add("dashboard-card-wrapper");

        // Subtle drop indicators (3px accent line, hidden by default)
        setupDropIndicators();

        // Build header with grip handle and accessibility controls
        buildHeader(title);

        getChildren().addAll(dropIndicatorAbove, headerRow, contentNode, dropIndicatorBelow);

        // Configure Drag-and-Drop on grip handle and container
        setupDragAndDrop();
    }

    private void setupDropIndicators() {
        dropIndicatorAbove.setMinHeight(3);
        dropIndicatorAbove.setPrefHeight(3);
        dropIndicatorAbove.setMaxHeight(3);
        dropIndicatorAbove.setStyle("-fx-background-color: #8b5cf6; -fx-background-radius: 2;");
        dropIndicatorAbove.setVisible(false);
        dropIndicatorAbove.setManaged(false);

        dropIndicatorBelow.setMinHeight(3);
        dropIndicatorBelow.setPrefHeight(3);
        dropIndicatorBelow.setMaxHeight(3);
        dropIndicatorBelow.setStyle("-fx-background-color: #8b5cf6; -fx-background-radius: 2;");
        dropIndicatorBelow.setVisible(false);
        dropIndicatorBelow.setManaged(false);
    }

    private void buildHeader(String title) {
        headerRow.setAlignment(Pos.CENTER_LEFT);
        headerRow.setPadding(new Insets(2, 4, 0, 4));

        // 6-dot Grip Handle
        Node gripIcon = UiIcons.createSvgIcon(UiIcons.GRIP_VERTICAL, 13, "currentColor");
        gripHandle.getChildren().add(gripIcon);
        gripHandle.setCursor(Cursor.MOVE);
        gripHandle.setPadding(new Insets(3, 5, 3, 5));
        gripHandle.setStyle("-fx-background-color: rgba(148, 163, 184, 0.15); -fx-background-radius: 4;");
        Tooltip gripTip = new Tooltip("Drag grip to rearrange card order");
        gripTip.setShowDelay(Duration.millis(300));
        Tooltip.install(gripHandle, gripTip);

        // Section Title Label - Enhanced for high readability and contrast
        Label titleLabel = new Label(title);
        titleLabel.getStyleClass().add("text-secondary");
        titleLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-letter-spacing: 0.5px;");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        // Accessibility controls: Move Up
        setupActionButton(btnMoveUp, UiIcons.CHEVRON_UP, "Move card up (keyboard accessible)",
                () -> layoutStore.moveUp(cardId));

        // Accessibility controls: Move Down
        setupActionButton(btnMoveDown, UiIcons.CHEVRON_DOWN, "Move card down (keyboard accessible)",
                () -> layoutStore.moveDown(cardId));

        // Hide card action
        setupActionButton(btnHide, UiIcons.EYE_OFF, "Hide this card (can be restored from Customize View)",
                () -> layoutStore.setCardVisible(cardId, false));

        gripHandle.setOpacity(0.0);
        btnMoveUp.setOpacity(0.0);
        btnMoveDown.setOpacity(0.0);
        btnHide.setOpacity(0.0);

        setOnMouseEntered(e -> {
            gripHandle.setOpacity(1.0);
            btnMoveUp.setOpacity(1.0);
            btnMoveDown.setOpacity(1.0);
            btnHide.setOpacity(1.0);
        });
        setOnMouseExited(e -> {
            gripHandle.setOpacity(0.0);
            btnMoveUp.setOpacity(0.0);
            btnMoveDown.setOpacity(0.0);
            btnHide.setOpacity(0.0);
        });

        headerRow.getChildren().addAll(gripHandle, titleLabel, spacer, btnMoveUp, btnMoveDown, btnHide);
    }

    private void setupActionButton(Button btn, String iconSvg, String tooltipText, Runnable action) {
        Node icon = UiIcons.createSvgIcon(iconSvg, 12, "currentColor");
        btn.setGraphic(icon);
        btn.setMinSize(24, 24);
        btn.setPrefSize(24, 24);
        btn.setMaxSize(24, 24);
        btn.setStyle("-fx-background-color: transparent; -fx-padding: 0; -fx-cursor: hand; -fx-background-radius: 4;");
        btn.setOnMouseEntered(e -> btn.setStyle("-fx-background-color: rgba(139, 92, 246, 0.2); -fx-padding: 0; -fx-cursor: hand; -fx-background-radius: 4;"));
        btn.setOnMouseExited(e -> btn.setStyle("-fx-background-color: transparent; -fx-padding: 0; -fx-cursor: hand; -fx-background-radius: 4;"));

        Tooltip tip = new Tooltip(tooltipText);
        tip.setShowDelay(Duration.millis(300));
        btn.setTooltip(tip);
        btn.setOnAction(e -> action.run());
    }

    private void setupDragAndDrop() {
        // Drag initiation STRICTLY from grip handle
        gripHandle.setOnDragDetected(event -> {
            Dragboard db = gripHandle.startDragAndDrop(TransferMode.MOVE);
            ClipboardContent content = new ClipboardContent();
            content.put(CARD_ID_FORMAT, cardId);
            content.putString(cardId);
            db.setContent(content);

            setOpacity(0.45);
            event.consume();
        });

        gripHandle.setOnDragDone(event -> {
            setOpacity(1.0);
            grid.clearDropIndicators();
            event.consume();
        });

        // Drag over detection on the entire card wrapper
        setOnDragOver(event -> {
            Dragboard db = event.getDragboard();
            String draggedId = extractCardId(db);

            if (draggedId != null && !cardId.equals(draggedId)) {
                event.acceptTransferModes(TransferMode.MOVE);

                // Calculate whether cursor is in the top or bottom half of the card
                boolean insertAfter = event.getY() > (getHeight() / 2.0);
                showDropIndicator(insertAfter);
            }
            event.consume();
        });

        setOnDragExited(event -> {
            clearDropIndicator();
            event.consume();
        });

        // Drop completion
        setOnDragDropped(event -> {
            Dragboard db = event.getDragboard();
            String draggedId = extractCardId(db);
            boolean success = false;

            if (draggedId != null && !cardId.equals(draggedId)) {
                boolean insertAfter = event.getY() > (getHeight() / 2.0);
                grid.handleCardDrop(draggedId, cardId, insertAfter);
                success = true;
            }

            clearDropIndicator();
            event.setDropCompleted(success);
            event.consume();
        });
    }

    private String extractCardId(Dragboard db) {
        if (db.hasContent(CARD_ID_FORMAT)) {
            Object content = db.getContent(CARD_ID_FORMAT);
            if (content instanceof String s) return s;
        }
        if (db.hasString()) {
            return db.getString();
        }
        return null;
    }

    public void showDropIndicator(boolean after) {
        grid.clearDropIndicators();
        if (after) {
            dropIndicatorBelow.setVisible(true);
            dropIndicatorBelow.setManaged(true);
        } else {
            dropIndicatorAbove.setVisible(true);
            dropIndicatorAbove.setManaged(true);
        }
    }

    public void clearDropIndicator() {
        dropIndicatorAbove.setVisible(false);
        dropIndicatorAbove.setManaged(false);
        dropIndicatorBelow.setVisible(false);
        dropIndicatorBelow.setManaged(false);
    }

    public String getCardId() {
        return cardId;
    }

    public Node getContentNode() {
        return contentNode;
    }
}
