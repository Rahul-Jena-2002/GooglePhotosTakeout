package com.photovault.ui.fx;

import com.photovault.auth.GoogleOAuthService;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.Separator;
import javafx.scene.control.TextField;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;
import javafx.stage.Modality;
import javafx.stage.Stage;
import javafx.stage.Window;

import java.util.function.Consumer;

/**
 * Modern shadcn-inspired Authentication dialog matching TakeoutFix account services.
 * Features Google OAuth 2.0 loopback authentication with instant fallback.
 */
public final class SignInDialog {

    private SignInDialog() {}

    public static void show(Window owner, boolean isDark, Consumer<String> onSuccessfulAuth) {
        show(owner, isDark, "Access Saved Verification Certificates & Reports", onSuccessfulAuth);
    }

    public static void show(Window owner, boolean isDark, String customSubtitle, Consumer<String> onSuccessfulAuth) {
        Stage dialog = new Stage();
        dialog.initModality(Modality.APPLICATION_MODAL);
        dialog.initOwner(owner);
        dialog.setTitle("Sign In — PhotoVault & TakeoutFix Account");

        VBox content = new VBox(14);
        content.setPadding(new Insets(24));
        content.setPrefWidth(380);
        content.getStyleClass().add("glass-card");

        // Header
        VBox headerBox = new VBox(4);
        headerBox.setAlignment(Pos.CENTER_LEFT);

        Label brand = new Label("PhotoVault Account");
        brand.getStyleClass().add("text-primary");
        brand.setStyle("-fx-font-size: 16px; -fx-font-weight: bold;");

        Label sub = new Label(customSubtitle != null ? customSubtitle : "Access saved verification certificates & reports");
        sub.getStyleClass().add("text-secondary");
        sub.setStyle("-fx-font-size: 11px; -fx-wrap-text: true;");

        headerBox.getChildren().addAll(brand, sub);

        // Status Label for OAuth loopback updates
        Label statusLabel = new Label();
        statusLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #3b82f6; -fx-wrap-text: true;");
        statusLabel.setVisible(false);
        statusLabel.setManaged(false);

        // Google Sign-In Button (Primary OAuth option)
        Button btnGoogle = new Button("Continue with Google");
        btnGoogle.getStyleClass().add("btn-primary");
        btnGoogle.setMaxWidth(Double.MAX_VALUE);
        btnGoogle.setStyle("-fx-background-color: #ffffff; -fx-text-fill: #18181b; -fx-font-weight: 600; -fx-font-size: 13px; -fx-padding: 9 16 9 16;");
        btnGoogle.setGraphic(UiIcons.createSvgIcon(UiIcons.USER, 13, "#4285f4"));
        btnGoogle.setGraphicTextGap(10);

        btnGoogle.setOnAction(e -> {
            statusLabel.setText("Opening browser for Google Sign-In... Please complete auth in browser.");
            statusLabel.setVisible(true);
            statusLabel.setManaged(true);
            btnGoogle.setDisable(true);

            GoogleOAuthService.startGoogleSignIn(
                    email -> {
                        statusLabel.setText("Signed in as " + email);
                        if (onSuccessfulAuth != null) onSuccessfulAuth.accept(email);
                        dialog.close();
                    },
                    err -> {
                        statusLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #f59e0b; -fx-wrap-text: true;");
                        statusLabel.setText("Browser auth unavailable: " + err + ". You can enter your email below.");
                        btnGoogle.setDisable(false);
                    }
            );
        });

        // Or separator
        HBox separatorBox = new HBox(8);
        separatorBox.setAlignment(Pos.CENTER);
        Separator leftSep = new Separator();
        HBox.setHgrow(leftSep, javafx.scene.layout.Priority.ALWAYS);
        Label orLabel = new Label("OR QUICK EMAIL");
        orLabel.getStyleClass().add("text-muted");
        orLabel.setStyle("-fx-font-size: 10px; -fx-font-weight: 600;");
        Separator rightSep = new Separator();
        HBox.setHgrow(rightSep, javafx.scene.layout.Priority.ALWAYS);
        separatorBox.getChildren().addAll(leftSep, orLabel, rightSep);

        // Quick Email Field
        TextField emailField = new TextField();
        emailField.setPromptText("Enter Google or TakeoutFix email");
        emailField.setStyle("-fx-font-size: 12px;");

        Button btnEmailSubmit = new Button("Sign In with Email");
        btnEmailSubmit.getStyleClass().add("btn-secondary");
        btnEmailSubmit.setMaxWidth(Double.MAX_VALUE);
        btnEmailSubmit.setOnAction(e -> {
            String email = emailField.getText().trim();
            if (!email.isEmpty() && email.contains("@")) {
                if (onSuccessfulAuth != null) onSuccessfulAuth.accept(email);
                dialog.close();
            } else {
                emailField.setStyle("-fx-border-color: #ef4444;");
            }
        });

        // Guest Dismiss button
        Button btnGuest = new Button("Continue as Guest (Blurred Logs)");
        btnGuest.getStyleClass().add("btn-secondary");
        btnGuest.setMaxWidth(Double.MAX_VALUE);
        btnGuest.setStyle("-fx-font-size: 11px; -fx-text-fill: #71717a;");
        btnGuest.setOnAction(e -> dialog.close());

        content.getChildren().addAll(headerBox, btnGoogle, statusLabel, separatorBox, emailField, btnEmailSubmit, btnGuest);

        Scene s = new Scene(content);
        String css = isDark ? "/css/photovault-dark.css" : "/css/photovault-light.css";
        var res = SignInDialog.class.getResource(css);
        if (res != null) s.getStylesheets().add(res.toExternalForm());

        dialog.setScene(s);
        dialog.showAndWait();
    }
}
