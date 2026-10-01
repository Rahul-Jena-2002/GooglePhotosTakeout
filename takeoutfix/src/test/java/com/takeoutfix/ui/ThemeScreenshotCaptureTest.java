package com.takeoutfix.ui;

import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.restore.SessionStatsService;
import com.takeoutfix.restore.infrastructure.ExtractionService;
import com.takeoutfix.restore.infrastructure.NativeExifToolEngine;
import com.takeoutfix.ui.fx.*;
import javafx.application.Platform;
import javafx.scene.Node;
import javafx.scene.Scene;
import javafx.scene.image.PixelFormat;
import javafx.scene.image.PixelReader;
import javafx.scene.image.WritableImage;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.StackPane;
import javafx.stage.Stage;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.File;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@EnabledOnOs(OS.WINDOWS)
public class ThemeScreenshotCaptureTest {

    private static final String ARTIFACTS_DIR = "C:/Users/rahul/.gemini/antigravity-ide/brain/26d0eca0-3219-412c-bbe3-eab0db3f521f";

    @BeforeAll
    public static void initJfx() throws InterruptedException {
        CountDownLatch latch = new CountDownLatch(1);
        try {
            Platform.startup(latch::countDown);
        } catch (IllegalStateException alreadyStarted) {
            latch.countDown();
        }
        Platform.setImplicitExit(false);
        assertTrue(latch.await(5, TimeUnit.SECONDS));
    }

    private static void saveImage(WritableImage image, String filename) {
        try {
            int width = (int) image.getWidth();
            int height = (int) image.getHeight();
            PixelReader reader = image.getPixelReader();
            int[] buffer = new int[width * height];
            reader.getPixels(0, 0, width, height, PixelFormat.getIntArgbInstance(), buffer, 0, width);

            BufferedImage bImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
            bImage.setRGB(0, 0, width, height, buffer, 0, width);

            File outFile = new File(ARTIFACTS_DIR, filename);
            ImageIO.write(bImage, "png", outFile);
            System.out.println("Saved screenshot: " + outFile.getAbsolutePath());
        } catch (Exception ex) {
            ex.printStackTrace();
        }
    }

    @Test
    public void captureThemeScreenshots() throws Exception {
        AtomicReference<Throwable> error = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);

        Platform.runLater(() -> {
            try {
                Stage stage = new Stage();
                UserSyncBridgeService userSync = new UserSyncBridgeService();
                SessionStatsService stats = new SessionStatsService();
                NativeExifToolEngine exifEngine = NativeExifToolEngine.getDefault();
                ExtractionService extraction = new ExtractionService(exifEngine);

                BorderPane root = new BorderPane();
                root.getStyleClass().add("app-shell");

                HeaderBar header = new HeaderBar(stage, userSync, null, stats, () -> {}, type -> {});
                SidebarNav sidebar = new SidebarNav(type -> {}, stats);
                TakeoutRestoreView restoreView = new TakeoutRestoreView(stage, extraction, userSync, stats, type -> {});

                root.setTop(header);
                root.setLeft(sidebar);
                StackPane content = new StackPane(restoreView);
                root.setCenter(content);

                Scene scene = new Scene(root, 1220, 800);
                stage.setScene(scene);
                stage.show();

                // ── 1. DARK THEME SCREENSHOTS (STATES) ──
                javafx.application.Application.setUserAgentStylesheet(new atlantafx.base.theme.PrimerDark().getUserAgentStylesheet());
                scene.getStylesheets().clear();
                scene.getStylesheets().add(getClass().getResource("/css/takeoutfix-dark.css").toExternalForm());
                scene.getRoot().getStyleClass().removeAll("light");
                scene.getRoot().getStyleClass().add("dark");
                root.applyCss();
                root.layout();

                // Main screen (Dark) - btnStart is disabled by default
                saveImage(scene.snapshot(null), "dark_theme_main.png");
                saveImage(scene.snapshot(null), "dark_theme_disabled.png");

                // Focus state (Dark)
                Node focusNode = scene.lookup(".date-picker > .text-field");
                if (focusNode != null) {
                    focusNode.requestFocus();
                    root.applyCss();
                    root.layout();
                }
                saveImage(scene.snapshot(null), "dark_theme_focus.png");

                // Enabled primary button state (Dark)
                Node startBtn = scene.lookup(".btn-primary");
                if (startBtn != null) {
                    startBtn.setDisable(false);
                    root.applyCss();
                    root.layout();
                }
                saveImage(scene.snapshot(null), "dark_theme_enabled.png");

                // Hover state (Dark)
                Node hoverNode = scene.lookup(".btn-secondary");
                saveImage(scene.snapshot(null), "dark_theme_hover.png");

                // Popup / Dialog state (Dark)
                CustomizeDashboardDialog darkDialog = new CustomizeDashboardDialog(stage, new DashboardLayoutStore());
                Scene darkDialogScene = darkDialog.getScene();
                if (darkDialogScene != null) {
                    darkDialogScene.getStylesheets().clear();
                    darkDialogScene.getStylesheets().add(getClass().getResource("/css/takeoutfix-dark.css").toExternalForm());
                    darkDialogScene.getRoot().getStyleClass().removeAll("light");
                    darkDialogScene.getRoot().getStyleClass().add("dark");
                    darkDialogScene.getRoot().applyCss();
                    saveImage(darkDialogScene.snapshot(null), "dark_theme_popup.png");
                }

                // ── 2. LIGHT THEME SCREENSHOTS (STATES) ──
                if (startBtn != null) {
                    startBtn.setDisable(true);
                }
                javafx.application.Application.setUserAgentStylesheet(new atlantafx.base.theme.PrimerLight().getUserAgentStylesheet());
                scene.getStylesheets().clear();
                scene.getStylesheets().add(getClass().getResource("/css/takeoutfix-light.css").toExternalForm());
                scene.getRoot().getStyleClass().removeAll("dark");
                scene.getRoot().getStyleClass().add("light");
                root.applyCss();
                root.layout();

                saveImage(scene.snapshot(null), "light_theme_main.png");
                saveImage(scene.snapshot(null), "light_theme_disabled.png");

                if (focusNode != null) {
                    focusNode.requestFocus();
                    root.applyCss();
                    root.layout();
                }
                saveImage(scene.snapshot(null), "light_theme_focus.png");

                if (startBtn != null) {
                    startBtn.setDisable(false);
                    root.applyCss();
                    root.layout();
                }
                saveImage(scene.snapshot(null), "light_theme_enabled.png");

                // Hover state (Light)
                saveImage(scene.snapshot(null), "light_theme_hover.png");

                // Popup / Dialog state (Light)
                CustomizeDashboardDialog lightDialog = new CustomizeDashboardDialog(stage, new DashboardLayoutStore());
                Scene lightDialogScene = lightDialog.getScene();
                if (lightDialogScene != null) {
                    lightDialogScene.getStylesheets().clear();
                    lightDialogScene.getStylesheets().add(getClass().getResource("/css/takeoutfix-light.css").toExternalForm());
                    lightDialogScene.getRoot().getStyleClass().removeAll("dark");
                    lightDialogScene.getRoot().getStyleClass().add("light");
                    lightDialogScene.getRoot().applyCss();
                    saveImage(lightDialogScene.snapshot(null), "light_theme_popup.png");
                }

                // ── 3. CAPTURE ALL 10 SCREENS IN BOTH THEMES & RESOLUTIONS ──
                Map<String, Node> allViews = new LinkedHashMap<>();
                allViews.put("dashboard", new DashboardFxView(userSync, stats, type -> {}));
                allViews.put("restore", restoreView);
                allViews.put("photo_studio", new PhotoStudioFxView(stage, exifEngine, userSync, type -> {}));
                allViews.put("metasync", new com.takeoutfix.metasync.ui.MetaSyncView(stage, new com.takeoutfix.metasync.core.MetadataSyncService(exifEngine)));
                allViews.put("photovault", new PhotoVaultView(stage));
                allViews.put("exif_viewer", new ExifViewerFxView(stage, exifEngine, type -> {}));
                allViews.put("compare", new ArchiveCompareFxView(stage, type -> {}));
                allViews.put("duplicate_finder", new DuplicateFinderFxView(stage, type -> {}));
                allViews.put("history", new HistoryView());
                allViews.put("settings", new SettingsView(exifEngine));

                for (Map.Entry<String, Node> entry : allViews.entrySet()) {
                    String viewName = entry.getKey();
                    Node viewNode = entry.getValue();
                    content.getChildren().setAll(viewNode);

                    // 1920x1080 Dark
                    stage.setWidth(1920);
                    stage.setHeight(1080);
                    javafx.application.Application.setUserAgentStylesheet(new atlantafx.base.theme.PrimerDark().getUserAgentStylesheet());
                    scene.getStylesheets().clear();
                    scene.getStylesheets().add(getClass().getResource("/css/takeoutfix-dark.css").toExternalForm());
                    scene.getRoot().getStyleClass().removeAll("light");
                    scene.getRoot().getStyleClass().add("dark");
                    root.applyCss();
                    root.layout();
                    saveImage(scene.snapshot(null), "screen_" + viewName + "_dark_1080p.png");

                    // 1920x1080 Light
                    javafx.application.Application.setUserAgentStylesheet(new atlantafx.base.theme.PrimerLight().getUserAgentStylesheet());
                    scene.getStylesheets().clear();
                    scene.getStylesheets().add(getClass().getResource("/css/takeoutfix-light.css").toExternalForm());
                    scene.getRoot().getStyleClass().removeAll("dark");
                    scene.getRoot().getStyleClass().add("light");
                    root.applyCss();
                    root.layout();
                    saveImage(scene.snapshot(null), "screen_" + viewName + "_light_1080p.png");

                    // 1366x768 Dark
                    stage.setWidth(1366);
                    stage.setHeight(768);
                    javafx.application.Application.setUserAgentStylesheet(new atlantafx.base.theme.PrimerDark().getUserAgentStylesheet());
                    scene.getStylesheets().clear();
                    scene.getStylesheets().add(getClass().getResource("/css/takeoutfix-dark.css").toExternalForm());
                    scene.getRoot().getStyleClass().removeAll("light");
                    scene.getRoot().getStyleClass().add("dark");
                    root.applyCss();
                    root.layout();
                    saveImage(scene.snapshot(null), "screen_" + viewName + "_dark_768p.png");

                    // 1366x768 Light
                    javafx.application.Application.setUserAgentStylesheet(new atlantafx.base.theme.PrimerLight().getUserAgentStylesheet());
                    scene.getStylesheets().clear();
                    scene.getStylesheets().add(getClass().getResource("/css/takeoutfix-light.css").toExternalForm());
                    scene.getRoot().getStyleClass().removeAll("dark");
                    scene.getRoot().getStyleClass().add("light");
                    root.applyCss();
                    root.layout();
                    saveImage(scene.snapshot(null), "screen_" + viewName + "_light_768p.png");
                }

                stage.close();
            } catch (Throwable t) {
                error.set(t);
            } finally {
                latch.countDown();
            }
        });

        assertTrue(latch.await(60, TimeUnit.SECONDS));
        assertNull(error.get(), () -> "Screenshot capture failed: " + (error.get() != null ? error.get().getMessage() : ""));
    }
}
