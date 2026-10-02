package com.takeoutfix;

import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.network.NetworkMonitorService;
import com.takeoutfix.restore.SessionStatsService;
import com.takeoutfix.restore.infrastructure.ExtractionService;
import com.takeoutfix.restore.infrastructure.NativeExifToolEngine;
import com.takeoutfix.shared.theme.AppTheme;
import com.takeoutfix.shared.theme.ThemeManager;
import com.takeoutfix.ui.fx.*;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.Scene;
import javafx.scene.image.Image;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.StackPane;
import javafx.stage.Stage;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

import java.util.HashMap;
import java.util.Map;

/**
 * Modern JavaFX Desktop Application entrypoint for TakeoutFix Studio.
 * Houses TakeoutFix (Google Takeout restoration) in a unified, hardware-accelerated
 * desktop interface with shadcn-inspired styling.
 * Pure JavaFX implementation (zero Swing components).
 *
 * Spring Boot bootstraps in {@link #init()} with {@link WebApplicationType#NONE} —
 * no embedded web server, no Tomcat. All @Component services are available via
 * {@link #springContext} for injection into future services.
 */
@SpringBootApplication
public class TakeoutFxApplication extends Application {

    private Stage stage;
    private Scene scene;
    private ConfigurableApplicationContext springContext;

    private SidebarNav sidebarNav;
    private HeaderBar headerBar;
    private StackPane workspaceContainer;

    // Lazily-created workspaces — only instantiated on first navigation
    private final Map<WorkspaceType, javafx.scene.Node> workspaces = new HashMap<>();

    // Core Backend Services
    private UserSyncBridgeService userSyncBridgeService;
    private NetworkMonitorService networkMonitorService;
    private SessionStatsService sessionStatsService;
    private NativeExifToolEngine exifToolEngine;
    private ExtractionService extractionService;
    private com.takeoutfix.updates.UpdateCheckerService updateCheckerService;
    private com.takeoutfix.task.TaskManager taskManager;
    private com.takeoutfix.task.PersistentTaskFooter persistentTaskFooter;

    @Override
    public void init() {
        // Bootstrap Spring Boot (no web server) before the JavaFX stage shows.
        // init() runs off the FX application thread — safe for blocking startup.
        springContext = new SpringApplicationBuilder(TakeoutFxApplication.class)
                .web(WebApplicationType.NONE)
                .headless(false) // JavaFX requires AWT not to be headless
                .run(getParameters().getRaw().toArray(new String[0]));

        FxHardwareManager.initialize();
        this.taskManager = com.takeoutfix.task.TaskManager.getInstance();
        this.userSyncBridgeService = new UserSyncBridgeService();
        this.networkMonitorService = new NetworkMonitorService();
        this.sessionStatsService = new SessionStatsService();
        this.exifToolEngine = NativeExifToolEngine.getDefault();
        this.extractionService = new ExtractionService(exifToolEngine);
        this.updateCheckerService = new com.takeoutfix.updates.UpdateCheckerService();
        this.updateCheckerService.start();
    }

    private void initWorkspaces() {
        TakeoutRestoreView restoreView = new TakeoutRestoreView(
                stage, extractionService, userSyncBridgeService, sessionStatsService, this::switchWorkspace);
        workspaces.put(WorkspaceType.TAKEOUT_RESTORE, restoreView);
        workspaceContainer.getChildren().add(restoreView);

        switchWorkspace(WorkspaceType.TAKEOUT_RESTORE);
    }

    public void switchWorkspace(WorkspaceType type) {
        // Lazily create workspace on first visit
        if (!workspaces.containsKey(type)) {
            javafx.scene.Node view = createWorkspace(type);
            if (view != null) {
                workspaces.put(type, view);
                workspaceContainer.getChildren().add(view);
            }
        }

        workspaces.forEach((wType, node) -> {
            boolean active = (wType == type);
            node.setVisible(active);
            node.setManaged(active);
        });

        if (sidebarNav != null) sidebarNav.select(type, false);
        if (headerBar != null) headerBar.setActivePill(type);
    }

    /** Creates the given workspace on first access. Returns null for unknown types. */
    private javafx.scene.Node createWorkspace(WorkspaceType type) {
        return switch (type) {
            case TAKEOUT_RESTORE -> new TakeoutRestoreView(stage, extractionService, userSyncBridgeService, sessionStatsService, this::switchWorkspace);
            case HISTORY -> new HistoryView();
            case SETTINGS -> new SettingsView(exifToolEngine);
            default -> null;
        };
    }

    @Override
    public void start(Stage primaryStage) {
        try {
            this.stage = primaryStage;
            primaryStage.setTitle("TakeoutFix - Google Takeout Restorer");
            applyWindowIcons(primaryStage);

            BorderPane root = new BorderPane();
            root.getStyleClass().add("app-shell");

            // 1. Top Header Bar (Brand + Nav Pills + Theme + Online + User Auth + OTA Updates)
            headerBar = new HeaderBar(primaryStage, userSyncBridgeService, networkMonitorService, sessionStatsService, updateCheckerService, this::applyTheme, this::switchWorkspace);
            root.setTop(headerBar);

            // 2. Left Session & Telemetry Sidebar
            sidebarNav = new SidebarNav(this::switchWorkspace, sessionStatsService);
            root.setLeft(sidebarNav);

            // 3. Center Content Area (StackPane of Workspaces)
            workspaceContainer = new StackPane();
            initWorkspaces();
            root.setCenter(workspaceContainer);

            // 4. Persistent Task Footer (Privacy, Active Tasks, Adaptive Resource Telemetry)
            this.persistentTaskFooter = new com.takeoutfix.task.PersistentTaskFooter(taskManager, this::switchWorkspace);
            root.setBottom(persistentTaskFooter);

            scene = new Scene(root, 1220, 840);
            applyTheme();

            primaryStage.setScene(scene);
            primaryStage.show();

            // Sync native OS title bar with default theme after HWND is realized
            Platform.runLater(this::applyTheme);

            // Listen to ThemeManager updates
            ThemeManager.addListener(theme -> Platform.runLater(this::applyTheme));

            // Restore session silently — no mandatory prompt on startup
            userSyncBridgeService.verifyStartupSession(authenticated -> {
                Platform.runLater(() -> {
                    if (authenticated) {
                        primaryStage.setTitle("TakeoutFix - Google Takeout Restorer — " + userSyncBridgeService.getCurrentName());
                        AppTheme current = ThemeManager.getCurrentTheme();
                        WindowsTitleBarTheme.applyTheme(primaryStage, current);
                    }
                    if (headerBar != null) {
                        headerBar.updateUserProfile();
                    }
                });
            });
        } catch (Throwable t) {
            System.err.println("CRITICAL: Failed to initialize TakeoutFix Application start: " + t.getMessage());
            t.printStackTrace();
            throw (t instanceof RuntimeException re) ? re : new RuntimeException(t);
        }
    }

    private void applyTheme() {
        if (scene == null) return;
        AppTheme theme = ThemeManager.getCurrentTheme();
        boolean dark = theme.isDark();
        com.takeoutfix.shared.theme.ThemeColors.setDark(dark);

        if (persistentTaskFooter != null) {
            persistentTaskFooter.setTheme(dark);
        }

        try {
            javafx.application.Application.setUserAgentStylesheet(
                    dark ? new atlantafx.base.theme.PrimerDark().getUserAgentStylesheet()
                         : new atlantafx.base.theme.PrimerLight().getUserAgentStylesheet()
            );
        } catch (Throwable ignored) {}

        scene.getStylesheets().clear();
        String css = theme.getCssPath();

        var res = getClass().getResource(css);
        if (res != null) {
            scene.getStylesheets().add(res.toExternalForm());
        }
        if (scene.getRoot() != null) {
            scene.getRoot().getStyleClass().removeAll("dark", "light");
            scene.getRoot().getStyleClass().add(dark ? "dark" : "light");
        }
        if (stage != null) {
            WindowsTitleBarTheme.applyTheme(stage, theme);
        }
    }

    private void applyWindowIcons(Stage stage) {
        try {
            int[] sizes = {16, 24, 32, 48, 64, 128};
            for (int s : sizes) {
                var stream = getClass().getResourceAsStream("/icons/icon.png");
                if (stream != null) {
                    stage.getIcons().add(new Image(stream, s, s, true, true));
                }
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void stop() {
        if (springContext != null) springContext.close();
        if (taskManager != null) {
            taskManager.shutdown();
        }
        if (exifToolEngine != null) {
            exifToolEngine.cleanup();
        }
        if (userSyncBridgeService != null) {
            userSyncBridgeService.syncOnClose();
        }
        // Force-terminate any lingering non-daemon threads (ExifTool processes, network clients, etc.)
        Platform.exit();
        System.exit(0);
    }

    public static void main(String[] args) {
        launch(args);
    }
}
