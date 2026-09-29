package com.takeoutfix.ui.fx;

import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.network.SystemHardwareInfo;
import com.takeoutfix.restore.SessionStatsService;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Modality;
import javafx.stage.Stage;
import javafx.stage.StageStyle;

/**
 * Interactive Personal Dashboard & Profile Flyout for TakeoutFix Desktop.
 * Opens when the user clicks their profile pill in the header.
 * Centralizes user identity, plan tier, lifetime restoration stats, hardware specs, and sign-out controls.
 */
public class ProfileDashboardDialog extends Stage {

    public ProfileDashboardDialog(Stage owner,
                                  UserSyncBridgeService userService,
                                  SessionStatsService statsService,
                                  Runnable onSignOut) {
        initOwner(owner);
        initModality(Modality.APPLICATION_MODAL);
        initStyle(StageStyle.UTILITY);
        setTitle("TakeoutFix — Personal Account & Dashboard");
        setResizable(false);

        VBox root = new VBox(14);
        root.setPadding(new Insets(22, 26, 22, 26));
        root.setPrefWidth(420);
        root.getStyleClass().add("glass-card");

        boolean signedIn = userService != null && userService.isSignedIn();
        String name = signedIn ? userService.getCurrentName() : "Guest User";
        String email = signedIn ? userService.getCurrentEmail() : "Local-only Session";
        String initial = name.isEmpty() ? "U" : name.substring(0, 1).toUpperCase();

        // 1. User Header Row
        HBox userRow = new HBox(14);
        userRow.setAlignment(Pos.CENTER_LEFT);

        Label avatarLabel = new Label(initial);
        avatarLabel.setAlignment(Pos.CENTER);
        avatarLabel.setPrefSize(48, 48);
        avatarLabel.setMinSize(48, 48);
        avatarLabel.setStyle("-fx-background-color: #6366f1; -fx-text-fill: white; -fx-font-size: 18px; -fx-font-weight: 800; -fx-background-radius: 24;");

        VBox userDetails = new VBox(2);
        Label nameLbl = new Label(name);
        nameLbl.setStyle("-fx-font-size: 15px; -fx-font-weight: 800;");

        Label emailLbl = new Label(email);
        emailLbl.setStyle("-fx-font-size: 11px; -fx-text-fill: #71717a;");

        Label tierBadge = new Label(signedIn ? "PRO TIER — UNLOCKED" : "GUEST TIER");
        tierBadge.setStyle(signedIn
                ? "-fx-font-size: 10px; -fx-font-weight: 700; -fx-text-fill: #10b981; -fx-background-color: rgba(16, 185, 129, 0.12); -fx-padding: 2 6 2 6; -fx-background-radius: 4;"
                : "-fx-font-size: 10px; -fx-font-weight: 700; -fx-text-fill: #f59e0b; -fx-background-color: rgba(245, 158, 11, 0.12); -fx-padding: 2 6 2 6; -fx-background-radius: 4;");

        userDetails.getChildren().addAll(nameLbl, emailLbl, tierBadge);
        userRow.getChildren().addAll(avatarLabel, userDetails);
        root.getChildren().add(userRow);

        root.getChildren().add(new Separator());

        // 2. Lifetime Operations Stats (2x2 Grid)
        Label opsTitle = new Label("LIFETIME RESTORATION STATS");
        opsTitle.setStyle("-fx-font-size: 10px; -fx-font-weight: 800; -fx-text-fill: #71717a;");

        GridPane statsGrid = new GridPane();
        statsGrid.setHgap(10);
        statsGrid.setVgap(10);

        long files = statsService != null ? statsService.getTotalFiles() : 0;
        long bytes = statsService != null ? statsService.getTotalBytes() : 0;
        double mb = bytes / (1024.0 * 1024.0);
        String storageStr = (mb > 1024.0) ? String.format("%.2f GB", mb / 1024.0) : String.format("%.1f MB", mb);

        VBox card1 = createStatTile("TOTAL RESTORED", storageStr, "#3b82f6");
        VBox card2 = createStatTile("FILES RESTORED", String.valueOf(files), "#10b981");
        VBox card3 = createStatTile("ENGINE", "Native ExifTool", "#8b5cf6");
        VBox card4 = createStatTile("PRIVACY", "100% Local Run", "#10b981");

        statsGrid.add(card1, 0, 0);
        statsGrid.add(card2, 1, 0);
        statsGrid.add(card3, 0, 1);
        statsGrid.add(card4, 1, 1);

        ColumnConstraints col1 = new ColumnConstraints();
        col1.setPercentWidth(50);
        ColumnConstraints col2 = new ColumnConstraints();
        col2.setPercentWidth(50);
        statsGrid.getColumnConstraints().addAll(col1, col2);

        root.getChildren().addAll(opsTitle, statsGrid);

        // 3. Host System Summary
        Label sysTitle = new Label("HOST HARDWARE TELEMETRY");
        sysTitle.setStyle("-fx-font-size: 10px; -fx-font-weight: 800; -fx-text-fill: #71717a;");

        VBox sysBox = new VBox(4);
        sysBox.setStyle("-fx-background-color: rgba(113, 113, 122, 0.06); -fx-padding: 8 10 8 10; -fx-background-radius: 6;");

        long totalRam = SystemHardwareInfo.getTotalPhysicalMemoryBytes();
        double ramGb = totalRam / (1024.0 * 1024.0 * 1024.0);
        int cores = Runtime.getRuntime().availableProcessors();

        Label cpuLbl = new Label("Processor: " + cores + " Logical Cores (" + System.getProperty("os.arch") + ")");
        cpuLbl.setStyle("-fx-font-size: 11px;");

        Label ramLbl = new Label(String.format("Physical RAM: %.1f GB Total Installed", ramGb));
        ramLbl.setStyle("-fx-font-size: 11px;");

        sysBox.getChildren().addAll(cpuLbl, ramLbl);
        root.getChildren().addAll(sysTitle, sysBox);

        // 4. Action Buttons
        HBox btnRow = new HBox(10);
        btnRow.setAlignment(Pos.CENTER_RIGHT);
        btnRow.setPadding(new Insets(6, 0, 0, 0));

        if (signedIn) {
            Button btnSync = new Button("Sync Cloud Now");
            btnSync.getStyleClass().add("btn-secondary");
            btnSync.setOnAction(e -> {
                if (userService != null) userService.triggerCloudSync(null);
                btnSync.setText("Synced!");
                btnSync.setDisable(true);
            });

            Button btnSignOut = new Button("Sign Out");
            btnSignOut.getStyleClass().add("btn-danger");
            btnSignOut.setStyle("-fx-text-fill: #ef4444; -fx-font-weight: 700;");
            btnSignOut.setOnAction(e -> {
                close();
                if (onSignOut != null) onSignOut.run();
            });

            btnRow.getChildren().addAll(btnSync, btnSignOut);
        } else {
            Label guestHint = new Label("Sign in with Google to enable cloud sync history.");
            guestHint.setStyle("-fx-font-size: 10px; -fx-text-fill: #71717a;");
            HBox.setHgrow(guestHint, Priority.ALWAYS);
            btnRow.getChildren().add(guestHint);
        }

        Button btnClose = new Button("Close");
        btnClose.getStyleClass().add("btn-secondary");
        btnClose.setOnAction(e -> close());
        btnRow.getChildren().add(btnClose);

        root.getChildren().add(btnRow);

        Scene scene = new Scene(root);
        if (owner != null && owner.getScene() != null) {
            scene.getStylesheets().addAll(owner.getScene().getStylesheets());
        } else {
            var css = getClass().getResource("/css/takeoutfix-dark.css");
            if (css != null) scene.getStylesheets().add(css.toExternalForm());
        }
        setScene(scene);
    }

    private VBox createStatTile(String title, String val, String accentColor) {
        VBox tile = new VBox(2);
        tile.setStyle("-fx-background-color: rgba(113, 113, 122, 0.06); -fx-padding: 8 10 8 10; -fx-background-radius: 6; -fx-border-left-color: " + accentColor + "; -fx-border-left-width: 3px;");

        Label t = new Label(title);
        t.setStyle("-fx-font-size: 9px; -fx-font-weight: 800; -fx-text-fill: #71717a;");

        Label v = new Label(val);
        v.setStyle("-fx-font-size: 13px; -fx-font-weight: 800;");

        tile.getChildren().addAll(t, v);
        return tile;
    }
}
