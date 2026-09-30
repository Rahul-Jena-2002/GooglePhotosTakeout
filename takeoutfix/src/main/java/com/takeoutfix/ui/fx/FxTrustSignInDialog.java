package com.takeoutfix.ui.fx;

import com.takeoutfix.auth.UserSyncBridgeService;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Modality;
import javafx.stage.Stage;
import javafx.stage.StageStyle;

import java.util.prefs.Preferences;

/**
 * Trust & Privacy Assurance Dialog for TakeoutFix.
 * Informs users that file restoration is 100% local and private,
 * with zero cloud uploads and optional Google sign-in.
 */
public class FxTrustSignInDialog extends Stage {

    private final UserSyncBridgeService userService;
    private final Runnable onProceed;

    public FxTrustSignInDialog(Stage owner, UserSyncBridgeService userService, Runnable onProceed) {
        this.userService = userService;
        this.onProceed = onProceed;

        initOwner(owner);
        initModality(Modality.APPLICATION_MODAL);
        initStyle(StageStyle.DECORATED);
        setTitle("TakeoutFix — Privacy & Trust Guarantee");
        setResizable(false);

        VBox root = new VBox(14);
        root.setAlignment(Pos.TOP_CENTER);
        root.setPadding(new Insets(24, 28, 20, 28));
        root.setPrefWidth(420);
        root.setStyle("-fx-background-color: #12131c; -fx-border-color: #2b2c3d; -fx-border-width: 1; -fx-border-radius: 8; -fx-background-radius: 8;");

        // 1. Icon & Header
        VBox headerBox = new VBox(6);
        headerBox.setAlignment(Pos.CENTER);

        var shieldIcon = UiIcons.createSvgIcon(UiIcons.LOCK, 32, "#10b981");
        Label title = new Label("100% Local & Private Processing");
        title.setStyle("-fx-font-size: 16px; -fx-font-weight: 800; -fx-text-fill: #f1f5f9;");

        Label subtitle = new Label("Your photos, videos, and JSON metadata never leave this computer.");
        subtitle.setWrapText(true);
        subtitle.setStyle("-fx-font-size: 12px; -fx-text-fill: #94a3b8; -fx-text-alignment: center;");

        headerBox.getChildren().addAll(shieldIcon, title, subtitle);
        root.getChildren().add(headerBox);

        // 2. Trust Highlights Card
        VBox highlightsBox = new VBox(8);
        highlightsBox.setPadding(new Insets(12, 14, 12, 14));
        highlightsBox.setStyle("-fx-background-color: rgba(255, 255, 255, 0.03); -fx-border-color: rgba(255, 255, 255, 0.08); -fx-border-radius: 6; -fx-background-radius: 6;");

        highlightsBox.getChildren().addAll(
                createHighlightRow("✓", "Offline Execution: Restores timestamps and EXIF tags locally using native ExifTool."),
                createHighlightRow("✓", "No File Limits: Full libraries of any size are processed completely free."),
                createHighlightRow("✓", "Sign-In is Optional: Only connect if you want to sync activity history across devices.")
        );
        root.getChildren().add(highlightsBox);

        // 3. Actions
        VBox actionsBox = new VBox(10);
        actionsBox.setAlignment(Pos.CENTER);

        // Continue as Guest (Default / Quick proceed)
        Button btnGuest = new Button("Continue as Guest (Process Locally)");
        btnGuest.setMaxWidth(Double.MAX_VALUE);
        btnGuest.setPrefHeight(38);
        btnGuest.setStyle("-fx-font-size: 13px; -fx-font-weight: 700; -fx-background-color: #8b5cf6; -fx-text-fill: white; -fx-background-radius: 6; -fx-cursor: hand;");
        btnGuest.setOnAction(e -> {
            close();
            if (onProceed != null) onProceed.run();
        });

        // Sign In with Google
        Button btnGoogle = new Button("Sign In with Google (Optional)");
        btnGoogle.setMaxWidth(Double.MAX_VALUE);
        btnGoogle.setPrefHeight(36);
        btnGoogle.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-background-color: rgba(255, 255, 255, 0.06); -fx-text-fill: #e2e8f0; -fx-border-color: rgba(255, 255, 255, 0.12); -fx-border-radius: 6; -fx-background-radius: 6; -fx-cursor: hand;");
        btnGoogle.setGraphic(UiIcons.createGoogleIcon(16));
        btnGoogle.setGraphicTextGap(8);
        btnGoogle.setOnAction(e -> {
            close();
            FxSignInDialog signInDialog = new FxSignInDialog(owner, userService, success -> {
                if (onProceed != null) onProceed.run();
            });
            signInDialog.showAndWait();
        });

        actionsBox.getChildren().addAll(btnGuest, btnGoogle);
        root.getChildren().add(actionsBox);

        // 4. "Don't show again" Checkbox
        CheckBox dontShowAgainCheck = new CheckBox("Don't show this trust reminder again");
        dontShowAgainCheck.setStyle("-fx-font-size: 11px; -fx-text-fill: #71717a; -fx-cursor: hand;");
        dontShowAgainCheck.selectedProperty().addListener((obs, oldVal, newVal) -> {
            Preferences prefs = Preferences.userNodeForPackage(TakeoutRestoreView.class);
            prefs.putBoolean("suppress_trust_popup", newVal);
        });
        root.getChildren().add(dontShowAgainCheck);

        Scene scene = new Scene(root);
        if (owner != null && owner.getScene() != null) {
            scene.getStylesheets().addAll(owner.getScene().getStylesheets());
        } else {
            var css = getClass().getResource("/css/takeoutfix-dark.css");
            if (css != null) scene.getStylesheets().add(css.toExternalForm());
        }

        setScene(scene);
    }

    private HBox createHighlightRow(String bullet, String text) {
        HBox row = new HBox(8);
        row.setAlignment(Pos.TOP_LEFT);
        Label b = new Label(bullet);
        b.setStyle("-fx-font-size: 11px; -fx-font-weight: 800; -fx-text-fill: #10b981;");
        Label t = new Label(text);
        t.setWrapText(true);
        t.setStyle("-fx-font-size: 11px; -fx-text-fill: #cbd5e1;");
        row.getChildren().addAll(b, t);
        return row;
    }
}
