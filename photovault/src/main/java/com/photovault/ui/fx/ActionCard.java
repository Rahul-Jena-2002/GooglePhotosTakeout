package com.photovault.ui.fx;

import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.VBox;

/**
 * Control action card containing Start/Pause/Resume & Cancel buttons and the read-only safety policy.
 */
public class ActionCard extends VBox {

    private final Button startPauseBtn;
    private final Button cancelBtn;
    private boolean isRunning = false;
    private boolean isPaused = false;

    private final Runnable onStart;
    private final Runnable onPause;
    private final Runnable onResume;
    private final Runnable onCancel;

    public ActionCard(Runnable onStart, Runnable onPause, Runnable onResume, Runnable onCancel) {
        super(10);
        this.onStart = onStart;
        this.onPause = onPause;
        this.onResume = onResume;
        this.onCancel = onCancel;
        getStyleClass().add("glass-card");

        startPauseBtn = new Button("Start");
        startPauseBtn.getStyleClass().add("btn-primary");
        startPauseBtn.setMaxWidth(Double.MAX_VALUE);
        startPauseBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.PLAY, 13, "#ffffff"));
        startPauseBtn.setOnAction(e -> handleStartPauseClick());

        cancelBtn = new Button("Cancel Verification");
        cancelBtn.getStyleClass().add("btn-cancel-red");
        cancelBtn.setMaxWidth(Double.MAX_VALUE);
        cancelBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.X, 12, "#ef4444"));
        cancelBtn.setDisable(true);
        cancelBtn.setOnAction(e -> {
            if (onCancel != null) onCancel.run();
        });

        Label notice = new Label("Zero Modifications: Strict read-only operation. Files are never moved, modified, or deleted.");
        notice.getStyleClass().add("text-muted");
        notice.setStyle("-fx-font-size: 11px; -fx-wrap-text: true;");
        notice.setGraphic(UiIcons.createSvgIcon(UiIcons.SHIELD, 12, "#71717a"));
        notice.setGraphicTextGap(6);

        getChildren().addAll(startPauseBtn, cancelBtn, notice);
    }

    private void handleStartPauseClick() {
        if (!isRunning) {
            if (onStart != null) onStart.run();
        } else if (!isPaused) {
            setPaused(true);
            if (onPause != null) onPause.run();
        } else {
            setPaused(false);
            if (onResume != null) onResume.run();
        }
    }

    public void setRunning(boolean running) {
        this.isRunning = running;
        this.isPaused = false;
        cancelBtn.setDisable(!running);

        startPauseBtn.getStyleClass().removeAll("btn-primary", "btn-pause-blue");
        if (running) {
            startPauseBtn.setText("Pause");
            startPauseBtn.getStyleClass().add("btn-pause-blue");
            startPauseBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.PAUSE, 13, "#ffffff"));
        } else {
            startPauseBtn.setText("Start");
            startPauseBtn.getStyleClass().add("btn-primary");
            startPauseBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.PLAY, 13, "#ffffff"));
        }
    }

    public void setPaused(boolean paused) {
        this.isPaused = paused;
        if (!isRunning) return;

        startPauseBtn.getStyleClass().removeAll("btn-primary", "btn-pause-blue");
        startPauseBtn.getStyleClass().add("btn-pause-blue");
        if (paused) {
            startPauseBtn.setText("Resume");
            startPauseBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.PLAY, 13, "#ffffff"));
        } else {
            startPauseBtn.setText("Pause");
            startPauseBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.PAUSE, 13, "#ffffff"));
        }
    }

    public boolean isPaused() {
        return isPaused;
    }
}
