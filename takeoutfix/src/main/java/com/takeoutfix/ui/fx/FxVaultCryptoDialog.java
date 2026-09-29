package com.takeoutfix.ui.fx;

import com.takeoutfix.vault.VaultCryptoService;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.FileChooser;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.io.File;

/**
 * Modal dialog for Private Photo Vault Authenticated Encryption (AES-256-GCM).
 * Enables users to encrypt private photos into protected .tfv files
 * or decrypt them back to their original form using a master passphrase.
 */
public class FxVaultCryptoDialog extends Stage {

    private final VaultCryptoService cryptoService = new VaultCryptoService();
    private File selectedFile = null;
    private final Label filePathLabel = new Label("No file selected");
    private final PasswordField passwordField = new PasswordField();
    private final Label statusLabel = new Label("Enter password and select a file to proceed.");
    private final RadioButton radioEncrypt = new RadioButton("Encrypt to Protected Vault (.tfv)");
    private final RadioButton radioDecrypt = new RadioButton("Decrypt Vault File (.tfv) to Photo");

    public FxVaultCryptoDialog(Stage owner) {
        initOwner(owner);
        initModality(Modality.APPLICATION_MODAL);
        setTitle("Private Photo Vault — Authenticated Storage (AES-256-GCM)");
        setResizable(false);

        VBox root = new VBox(14);
        root.setPadding(new Insets(20, 24, 20, 24));
        root.setPrefWidth(480);

        // Header
        VBox headerBox = new VBox(4);
        Label title = new Label("Private Vault Security");
        title.setStyle("-fx-font-size: 16px; -fx-font-weight: 800;");
        Label subtitle = new Label("Local-first authenticated encryption. Passwords and keys never leave this machine.");
        subtitle.setStyle("-fx-font-size: 11px; -fx-text-fill: #71717a;");
        subtitle.setWrapText(true);
        headerBox.getChildren().addAll(title, subtitle);

        // Mode Selector
        ToggleGroup group = new ToggleGroup();
        radioEncrypt.setToggleGroup(group);
        radioDecrypt.setToggleGroup(group);
        radioEncrypt.setSelected(true);
        HBox modeRow = new HBox(12, radioEncrypt, radioDecrypt);
        modeRow.setStyle("-fx-padding: 4 0 4 0;");

        // File Selection Row
        VBox fileBox = new VBox(4);
        Label fileLbl = new Label("Target File:");
        fileLbl.setStyle("-fx-font-size: 11px; -fx-font-weight: 700;");

        HBox fileRow = new HBox(8);
        fileRow.setAlignment(Pos.CENTER_LEFT);
        filePathLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #a1a1aa;");
        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);
        Button btnBrowse = new Button("Browse...");
        btnBrowse.getStyleClass().add("btn-secondary");
        btnBrowse.setOnAction(e -> chooseFile());
        fileRow.getChildren().addAll(filePathLabel, sp, btnBrowse);
        fileBox.getChildren().addAll(fileLbl, fileRow);

        // Password Row
        VBox passBox = new VBox(4);
        Label passLbl = new Label("Master Vault Password:");
        passLbl.setStyle("-fx-font-size: 11px; -fx-font-weight: 700;");
        passwordField.setPromptText("Enter strong passphrase...");
        passBox.getChildren().addAll(passLbl, passwordField);

        // Status Feedback
        statusLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #71717a;");
        statusLabel.setWrapText(true);

        // Action Buttons
        HBox actionRow = new HBox(10);
        actionRow.setAlignment(Pos.CENTER_RIGHT);
        Button btnCancel = new Button("Close");
        btnCancel.getStyleClass().add("btn-ghost");
        btnCancel.setOnAction(e -> close());

        Button btnExecute = new Button("Execute Secure Action");
        btnExecute.getStyleClass().add("btn-primary");
        btnExecute.setOnAction(e -> executeAction());

        actionRow.getChildren().addAll(btnCancel, btnExecute);

        root.getChildren().addAll(headerBox, modeRow, new Separator(), fileBox, passBox, statusLabel, new Separator(), actionRow);

        Scene scene = new Scene(root);
        if (owner != null && owner.getScene() != null && !owner.getScene().getStylesheets().isEmpty()) {
            scene.getStylesheets().addAll(owner.getScene().getStylesheets());
        }
        setScene(scene);
    }

    private void chooseFile() {
        FileChooser chooser = new FileChooser();
        if (radioEncrypt.isSelected()) {
            chooser.setTitle("Select Photo or Video to Encrypt");
        } else {
            chooser.setTitle("Select Protected Vault (.tfv) File to Decrypt");
            chooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("TakeoutFix Vault (*.tfv)", "*.tfv"));
        }
        File f = chooser.showOpenDialog(this);
        if (f != null) {
            this.selectedFile = f;
            filePathLabel.setText(f.getName() + " (" + (f.length() / 1024) + " KB)");
            statusLabel.setText("File selected: " + f.getName());
            statusLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #10b981;");
        }
    }

    private void executeAction() {
        if (selectedFile == null || !selectedFile.exists()) {
            statusLabel.setText("Please select a valid file first.");
            statusLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #ef4444;");
            return;
        }

        String pass = passwordField.getText();
        if (pass == null || pass.isBlank()) {
            statusLabel.setText("Please enter a master password.");
            statusLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #ef4444;");
            return;
        }

        boolean encrypt = radioEncrypt.isSelected();
        new Thread(() -> {
            try {
                if (encrypt) {
                    File vaultFile = new File(selectedFile.getParentFile(), selectedFile.getName() + ".tfv");
                    cryptoService.encryptFile(selectedFile, vaultFile, pass.toCharArray());
                    Platform.runLater(() -> {
                        statusLabel.setText("Encrypted successfully: " + vaultFile.getName());
                        statusLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #10b981; -fx-font-weight: 700;");
                    });
                } else {
                    String origName = selectedFile.getName();
                    if (origName.endsWith(".tfv")) {
                        origName = origName.substring(0, origName.length() - 4);
                    } else {
                        origName = "decrypted_" + origName;
                    }
                    File restored = new File(selectedFile.getParentFile(), origName);
                    cryptoService.decryptFile(selectedFile, restored, pass.toCharArray());
                    Platform.runLater(() -> {
                        statusLabel.setText("Decrypted successfully: " + restored.getName());
                        statusLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #10b981; -fx-font-weight: 700;");
                    });
                }
            } catch (Exception ex) {
                Platform.runLater(() -> {
                    statusLabel.setText("Action failed: " + (ex.getMessage() != null ? ex.getMessage() : ex.toString()));
                    statusLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #ef4444; -fx-font-weight: 700;");
                });
            }
        }).start();
    }
}
