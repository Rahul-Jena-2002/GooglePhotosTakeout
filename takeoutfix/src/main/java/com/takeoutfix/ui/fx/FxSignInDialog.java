package com.takeoutfix.ui.fx;

import com.takeoutfix.auth.AuthSession;
import com.takeoutfix.auth.CredentialStore;
import com.takeoutfix.auth.UserController;
import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.network.DirectAuthHttpsService;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.layout.*;
import javafx.stage.Modality;
import javafx.stage.Stage;
import javafx.stage.StageStyle;

import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;

/**
 * Native Pure JavaFX Sign-In Dialog for TakeoutFix Desktop.
 * Mirrors the exact visual design and dual-mode functionality of the classic TakeoutFix sign-in:
 * - Brand logo & "Restore your digital life."
 * - Email & Password direct authentication
 * - "Forgot?" password reset flow
 * - "── or ──" separator
 * - "Continue with Google" OAuth 2.0 PKCE browser loopback flow
 * - "Trouble connecting? Paste code manually" enterprise token fallback
 * - Padlock + "Secure authentication" badge
 */
public class FxSignInDialog extends Stage {

    private final UserSyncBridgeService userService;
    private final Consumer<Boolean> onAuthComplete;
    private final CredentialStore credentialStore = new CredentialStore();

    // Inputs
    private final TextField emailField = new TextField();
    private final PasswordField passwordField = new PasswordField();
    private final Button btnSignIn = new Button("Sign In");
    private final Button btnGoogleSignIn = new Button("Continue with Google");
    private final Hyperlink forgotLink = new Hyperlink("Forgot?");
    private final Hyperlink manualCodeLink = new Hyperlink("Trouble connecting? Paste code manually");

    // Status feedback
    private final Label statusLabel = new Label();
    private final ProgressIndicator progressSpinner = new ProgressIndicator();

    public FxSignInDialog(Stage owner, UserSyncBridgeService userService, Consumer<Boolean> onAuthComplete) {
        this.userService = userService;
        this.onAuthComplete = onAuthComplete;

        initOwner(owner);
        initModality(Modality.APPLICATION_MODAL);
        initStyle(StageStyle.DECORATED);
        setTitle("TakeoutFix — Sign In");
        setResizable(false);
        applyWindowIcons();

        VBox root = new VBox(0);
        root.setAlignment(Pos.TOP_CENTER);
        root.setPadding(new Insets(24, 34, 20, 34));
        root.getStyleClass().add("sign-in-modal");
        root.setPrefWidth(390);

        // 1. Brand Logo Header
        VBox brandBox = new VBox(4);
        brandBox.setAlignment(Pos.CENTER);

        ImageView logoView = null;
        try {
            var stream = getClass().getResourceAsStream("/icons/icon.png");
            if (stream != null) {
                logoView = new ImageView(new Image(stream, 48, 48, true, true));
            }
        } catch (Exception ignored) {}

        if (logoView != null) {
            brandBox.getChildren().add(logoView);
        } else {
            brandBox.getChildren().add(UiIcons.createSvgIcon(UiIcons.RESTORE, 36, "#8b5cf6"));
        }

        Label titleLabel = new Label("TakeoutFix");
        titleLabel.setStyle("-fx-font-size: 20px; -fx-font-weight: 800; -fx-padding: 4 0 0 0;");

        Label subtitleLabel = new Label("Restore your digital life.");
        subtitleLabel.setStyle("-fx-font-size: 12px; -fx-text-fill: #71717a;");

        brandBox.getChildren().addAll(titleLabel, subtitleLabel);
        root.getChildren().add(brandBox);

        // Spacer
        root.getChildren().add(createSpacer(18));

        // 2. Email Field
        VBox emailBox = new VBox(4);
        Label emailLabel = new Label("Email");
        emailLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 700;");
        emailField.setPromptText("name@example.com");
        emailField.setPrefHeight(36);
        emailField.setStyle("-fx-font-size: 12px; -fx-background-radius: 6;");
        emailBox.getChildren().addAll(emailLabel, emailField);
        root.getChildren().add(emailBox);

        // Spacer
        root.getChildren().add(createSpacer(12));

        // 3. Password Field with "Forgot?" link
        VBox passBox = new VBox(4);
        HBox passHeader = new HBox();
        Label passLabel = new Label("Password");
        passLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 700;");
        Region sp1 = new Region();
        HBox.setHgrow(sp1, Priority.ALWAYS);

        forgotLink.setStyle("-fx-font-size: 11px; -fx-text-fill: #6366f1; -fx-padding: 0;");
        forgotLink.setOnAction(e -> handleForgotPassword());
        passHeader.getChildren().addAll(passLabel, sp1, forgotLink);

        passwordField.setPromptText("••••••••••••");
        passwordField.setPrefHeight(36);
        passwordField.setStyle("-fx-font-size: 12px; -fx-background-radius: 6;");
        passBox.getChildren().addAll(passHeader, passwordField);
        root.getChildren().add(passBox);

        // Enter key triggers sign in
        emailField.setOnAction(e -> passwordField.requestFocus());
        passwordField.setOnAction(e -> handleEmailSignIn());

        // Spacer
        root.getChildren().add(createSpacer(16));

        // 4. Primary Sign In Button
        btnSignIn.setMaxWidth(Double.MAX_VALUE);
        btnSignIn.setPrefHeight(38);
        btnSignIn.getStyleClass().add("btn-primary");
        btnSignIn.setStyle("-fx-font-size: 13px; -fx-font-weight: 700; -fx-background-color: #6366f1; -fx-text-fill: white; -fx-background-radius: 6;");
        btnSignIn.setOnAction(e -> handleEmailSignIn());
        root.getChildren().add(btnSignIn);

        // Spacer
        root.getChildren().add(createSpacer(12));

        // 5. "── or ──" Divider
        HBox divider = new HBox(8);
        divider.setAlignment(Pos.CENTER);
        Separator sep1 = new Separator();
        HBox.setHgrow(sep1, Priority.ALWAYS);
        Label orLabel = new Label("or");
        orLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #a1a1aa;");
        Separator sep2 = new Separator();
        HBox.setHgrow(sep2, Priority.ALWAYS);
        divider.getChildren().addAll(sep1, orLabel, sep2);
        root.getChildren().add(divider);

        // Spacer
        root.getChildren().add(createSpacer(12));

        // 6. Continue with Google Button
        btnGoogleSignIn.setMaxWidth(Double.MAX_VALUE);
        btnGoogleSignIn.setPrefHeight(38);
        btnGoogleSignIn.getStyleClass().add("btn-secondary");
        btnGoogleSignIn.setStyle("-fx-font-size: 13px; -fx-font-weight: 700; -fx-background-radius: 6;");
        btnGoogleSignIn.setGraphic(UiIcons.createGoogleIcon(18));
        btnGoogleSignIn.setGraphicTextGap(10);
        btnGoogleSignIn.setOnAction(e -> handleGoogleSignIn());
        root.getChildren().add(btnGoogleSignIn);

        // Continue as Guest Option
        Button btnContinueGuest = new Button("Continue as Guest (No Account Required)");
        btnContinueGuest.setMaxWidth(Double.MAX_VALUE);
        btnContinueGuest.setPrefHeight(32);
        btnContinueGuest.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-background-color: transparent; -fx-text-fill: #94a3b8; -fx-border-color: rgba(255, 255, 255, 0.1); -fx-border-radius: 6; -fx-background-radius: 6; -fx-cursor: hand;");
        btnContinueGuest.setOnAction(e -> {
            close();
            if (onAuthComplete != null) onAuthComplete.accept(false);
        });
        root.getChildren().addAll(createSpacer(6), btnContinueGuest);

        // Spacer
        root.getChildren().add(createSpacer(10));

        // 7. Manual Token Link
        manualCodeLink.setStyle("-fx-font-size: 11px; -fx-text-fill: #6366f1; -fx-padding: 0;");
        manualCodeLink.setOnAction(e -> handleManualToken());
        root.getChildren().add(manualCodeLink);

        // Spacer
        root.getChildren().add(createSpacer(10));

        // 8. Status & Spinner
        HBox statusBox = new HBox(8);
        statusBox.setAlignment(Pos.CENTER);
        progressSpinner.setPrefSize(18, 18);
        progressSpinner.setVisible(false);
        progressSpinner.setManaged(false);
        statusLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #ef4444; -fx-alignment: center;");
        statusLabel.setWrapText(true);
        statusBox.getChildren().addAll(progressSpinner, statusLabel);
        root.getChildren().add(statusBox);

        // Spacer
        Region bottomSpacer = new Region();
        VBox.setVgrow(bottomSpacer, Priority.ALWAYS);
        root.getChildren().add(bottomSpacer);

        // 9. Trust Badge Footer
        HBox footer = new HBox(6);
        footer.setAlignment(Pos.CENTER);
        footer.setPadding(new Insets(10, 0, 0, 0));
        var lockIcon = UiIcons.createSvgIcon(UiIcons.LOCK, 12, "#71717a");
        Label lockText = new Label("Secure authentication");
        lockText.setStyle("-fx-font-size: 11px; -fx-text-fill: #71717a;");
        footer.getChildren().addAll(lockIcon, lockText);
        root.getChildren().add(footer);

        Scene scene = new Scene(root);
        if (owner != null && owner.getScene() != null) {
            scene.getStylesheets().addAll(owner.getScene().getStylesheets());
        } else {
            var css = getClass().getResource("/css/takeoutfix-dark.css");
            if (css != null) scene.getStylesheets().add(css.toExternalForm());
        }

        setScene(scene);
    }

    private Region createSpacer(double height) {
        Region r = new Region();
        r.setPrefHeight(height);
        r.setMinHeight(height);
        return r;
    }

    private void handleEmailSignIn() {
        String email = emailField.getText() != null ? emailField.getText().trim() : "";
        String password = passwordField.getText() != null ? passwordField.getText().trim() : "";

        if (email.isEmpty() || password.isEmpty()) {
            showError("Please enter both email and password.");
            return;
        }

        setLoading(true, "Signing in...");

        CompletableFuture.supplyAsync(() -> {
            try {
                return DirectAuthHttpsService.authenticateWithEmailPassword(email, password);
            } catch (Exception ex) {
                throw new java.util.concurrent.CompletionException(ex);
            }
        }).whenComplete((session, error) -> Platform.runLater(() -> {
            setLoading(false, "");
            if (error != null) {
                Throwable cause = error.getCause() != null ? error.getCause() : error;
                showError(cause.getMessage() != null ? cause.getMessage() : "Authentication failed.");
            } else if (session != null && session.isAuthenticated()) {
                saveAndCompleteAuth(session);
            } else {
                showError("Authentication failed. Please verify credentials.");
            }
        }));
    }

    private void handleGoogleSignIn() {
        setLoading(true, "Opening browser for Google authentication...");

        userService.getGoogleAuthService().authenticate().whenComplete((session, error) -> Platform.runLater(() -> {
            setLoading(false, "");
            if (error != null) {
                Throwable cause = error.getCause() != null ? error.getCause() : error;
                showError("Google authentication was cancelled or failed: " + cause.getMessage());
            } else if (session != null && session.isAuthenticated()) {
                saveAndCompleteAuth(session);
            } else {
                showError("Google Sign-In failed.");
            }
        }));
    }

    private void handleForgotPassword() {
        String email = emailField.getText() != null ? emailField.getText().trim() : "";
        if (email.isEmpty() || !email.contains("@")) {
            showError("Enter your email address to reset password.");
            emailField.requestFocus();
            return;
        }

        setLoading(true, "Sending password reset email...");

        CompletableFuture.runAsync(() -> {
            try {
                DirectAuthHttpsService.sendPasswordReset(email);
                Platform.runLater(() -> {
                    setLoading(false, "");
                    statusLabel.setText("Password reset link sent! Check your inbox.");
                    statusLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #10b981;");
                });
            } catch (Exception ex) {
                Platform.runLater(() -> {
                    setLoading(false, "");
                    showError(ex.getMessage() != null ? ex.getMessage() : "Failed to send reset email.");
                });
            }
        });
    }

    private void handleManualToken() {
        TextInputDialog dialog = new TextInputDialog();
        dialog.initOwner(this);
        dialog.setTitle("Enterprise Login — Manual Code");
        dialog.setHeaderText("Paste the authorization code or URL from your browser:");
        dialog.setContentText("Code / URL:");

        var result = dialog.showAndWait();
        if (result.isPresent() && !result.get().trim().isEmpty()) {
            String input = result.get().trim();
            setLoading(true, "Verifying authorization code...");

            CompletableFuture.<AuthSession>supplyAsync(() -> {
                try {
                    Map<String, Object> map = DirectAuthHttpsService.parseAndAuthenticate(input);
                    String uid = String.valueOf(map.getOrDefault("uid", ""));
                    String email = String.valueOf(map.getOrDefault("email", ""));
                    String name = String.valueOf(map.getOrDefault("displayName", email.contains("@") ? email.split("@")[0] : "User"));
                    String token = String.valueOf(map.getOrDefault("token", map.getOrDefault("idToken", "")));
                    String refreshToken = String.valueOf(map.getOrDefault("refreshToken", ""));
                    String plan = String.valueOf(map.getOrDefault("plan", "free"));
                    long expiresAt = System.currentTimeMillis() + 3600_000L;
                    return new AuthSession(uid, email, name, "", token, refreshToken, plan, expiresAt);
                } catch (Exception ex) {
                    throw new java.util.concurrent.CompletionException(ex);
                }
            }).whenComplete((session, error) -> Platform.runLater(() -> {
                setLoading(false, "");
                if (error != null) {
                    showError("Invalid code or URL. Please verify.");
                } else if (session != null && session.isAuthenticated()) {
                    saveAndCompleteAuth(session);
                }
            }));
        }
    }

    private void saveAndCompleteAuth(AuthSession session) {
        credentialStore.saveSession(session);
        if (userService != null) {
            userService.getSessionManager().save(session);
            UserController.syncUser(session.toMap());
            userService.triggerCloudSync(null);
        }
        close();
        if (onAuthComplete != null) {
            onAuthComplete.accept(true);
        }
    }

    private void setLoading(boolean loading, String message) {
        btnSignIn.setDisable(loading);
        btnGoogleSignIn.setDisable(loading);
        emailField.setDisable(loading);
        passwordField.setDisable(loading);
        forgotLink.setDisable(loading);
        manualCodeLink.setDisable(loading);
        progressSpinner.setVisible(loading);
        progressSpinner.setManaged(loading);
        statusLabel.setText(message);
        statusLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #3b82f6;");
    }

    private void showError(String msg) {
        statusLabel.setText(msg);
        statusLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #ef4444;");
    }

    private void applyWindowIcons() {
        try {
            int[] sizes = {16, 24, 32, 48};
            for (int s : sizes) {
                var stream = getClass().getResourceAsStream("/icons/icon.png");
                if (stream != null) {
                    getIcons().add(new Image(stream, s, s, true, true));
                }
            }
        } catch (Exception ignored) {}
    }
}
