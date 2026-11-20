package com.takeoutfix.ui.fx;

import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.auth.GuestQuotaStore;
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
        this(owner, userService, onProceed, false);
    }

    public FxTrustSignInDialog(Stage owner, UserSyncBridgeService userService, Runnable onProceed, boolean requireSignIn) {
        this.userService = userService;
        this.onProceed = onProceed;
        boolean guestLimitReached = (requireSignIn || GuestQuotaStore.isExhausted())
                && (userService == null || !userService.isSignedIn());

        initOwner(owner);
        initModality(Modality.APPLICATION_MODAL);
        initStyle(StageStyle.DECORATED);
        setTitle("TakeoutFix — Before you start");
        setResizable(false);

        VBox root = new VBox(14);
        root.setAlignment(Pos.TOP_CENTER);
        root.setPadding(new Insets(24, 28, 20, 28));
        root.setPrefWidth(420);
        root.getStyleClass().add("sign-in-modal");

        // 1. Icon & Header
        VBox headerBox = new VBox(6);
        headerBox.setAlignment(Pos.CENTER);

        var shieldIcon = UiIcons.createSvgIcon(UiIcons.LOCK, 32, "#10b981");
        Label title = new Label(guestLimitReached ? "Guest allowance reached" : "Restore your photos with confidence");
        title.getStyleClass().add("page-title");

        Label subtitle = new Label(guestLimitReached
                ? "Sign in to continue restoring for free."
                : "Your selected photos and videos are processed on this computer.");
        subtitle.setWrapText(true);
        subtitle.getStyleClass().add("text-muted");
        subtitle.setStyle("-fx-text-alignment: center;");

        headerBox.getChildren().addAll(shieldIcon, title, subtitle);
        root.getChildren().add(headerBox);

        // 2. Trust Highlights Card
        VBox highlightsBox = new VBox(8);
        highlightsBox.setPadding(new Insets(12, 14, 12, 14));
        highlightsBox.getStyleClass().add("card");

        highlightsBox.getChildren().addAll(
                createHighlightRow("Try up to 1 GB as a guest, then sign in to continue for free."),
                createHighlightRow("Choose a separate output folder and keep your original export as a backup."),
                createHighlightRow("Sign-in and account sync require an internet connection.")
        );
        root.getChildren().add(highlightsBox);

        // 3. Actions
        VBox actionsBox = new VBox(10);
        actionsBox.setAlignment(Pos.CENTER);

        // Continue as Guest (Default / Quick proceed)
        Button btnGuest = new Button("Continue as Guest (1 GB Free)");
        btnGuest.setMaxWidth(Double.MAX_VALUE);
        btnGuest.setPrefHeight(38);
        btnGuest.getStyleClass().add("btn-primary");
        btnGuest.setOnAction(e -> {
            close();
            if (onProceed != null) onProceed.run();
        });

        // Sign In with Google
        Button btnGoogle = new Button("Sign In with Google (Unlock Unlimited)");
        btnGoogle.setMaxWidth(Double.MAX_VALUE);
        btnGoogle.setPrefHeight(36);
        btnGoogle.getStyleClass().add("btn-secondary");
        btnGoogle.setGraphic(UiIcons.createGoogleIcon(16));
        btnGoogle.setGraphicTextGap(8);
        btnGoogle.setOnAction(e -> {
            close();
            FxSignInDialog signInDialog = new FxSignInDialog(owner, userService, success -> {
                if (onProceed != null) onProceed.run();
            });
            signInDialog.showAndWait();
        });

        if (!guestLimitReached) actionsBox.getChildren().add(btnGuest);
        actionsBox.getChildren().add(btnGoogle);
        root.getChildren().add(actionsBox);

        // 4. "Don't show again" Checkbox
        CheckBox dontShowAgainCheck = new CheckBox("Don't show this trust reminder again");
        dontShowAgainCheck.selectedProperty().addListener((obs, oldVal, newVal) -> {
            Preferences prefs = Preferences.userNodeForPackage(TakeoutRestoreView.class);
            prefs.putBoolean("suppress_trust_popup", newVal);
        });
        if (!guestLimitReached) root.getChildren().add(dontShowAgainCheck);

        Scene scene = new Scene(root);
        if (owner != null && owner.getScene() != null) {
            scene.getStylesheets().addAll(owner.getScene().getStylesheets());
        } else {
            var css = getClass().getResource("/css/takeoutfix-dark.css");
            if (css != null) scene.getStylesheets().add(css.toExternalForm());
        }

        setScene(scene);
    }

    private HBox createHighlightRow(String text) {
        HBox row = new HBox(8);
        row.setAlignment(Pos.TOP_LEFT);
        var b = UiIcons.createSvgIcon(UiIcons.CHECK, 14, "#10b981");
        Label t = new Label(text);
        t.setWrapText(true);
        t.getStyleClass().add("text-muted");
        HBox.setHgrow(t, Priority.ALWAYS);
        row.getChildren().addAll(b, t);
        return row;
    }
}
