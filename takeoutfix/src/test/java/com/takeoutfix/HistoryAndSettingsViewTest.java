package com.takeoutfix;

import com.takeoutfix.restore.infrastructure.NativeExifToolEngine;
import com.takeoutfix.ui.fx.HistoryView;
import com.takeoutfix.ui.fx.ProfileDashboardDialog;
import com.takeoutfix.ui.fx.SettingsView;
import javafx.application.Platform;
import javafx.scene.control.ListView;
import javafx.scene.control.Label;
import javafx.scene.control.ScrollPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

@EnabledOnOs(OS.WINDOWS)
public class HistoryAndSettingsViewTest {

    @BeforeAll
    public static void initJfx() throws InterruptedException {
        CountDownLatch latch = new CountDownLatch(1);
        try {
            Platform.startup(() -> {
                Platform.setImplicitExit(false);
                latch.countDown();
            });
        } catch (IllegalStateException alreadyStarted) {
            try {
                Platform.setImplicitExit(false);
            } catch (Throwable ignored) {}
            latch.countDown();
        }
        assertTrue(latch.await(5, TimeUnit.SECONDS));
    }

    @Test
    public void accountDialogShowsHardwareLabelsForGuest() throws Exception {
        AtomicReference<Throwable> error = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);
        Platform.runLater(() -> {
            Stage owner = new Stage();
            ProfileDashboardDialog dialog = null;
            try {
                dialog = new ProfileDashboardDialog(owner, null, null, null);
                VBox root = (VBox) dialog.getScene().getRoot();
                VBox system = (VBox) root.getChildren().stream()
                        .filter(node -> node instanceof VBox box && box.getChildren().stream()
                                .anyMatch(child -> child instanceof Label label && label.getText().startsWith("Processor:")))
                        .findFirst().orElseThrow();
                assertTrue(system.getChildren().stream().anyMatch(node -> node instanceof Label label && label.getText().startsWith("System RAM:")));
                assertTrue(system.getChildren().stream().anyMatch(node -> node instanceof Label label && label.getText().startsWith("Memory modules:")));
            } catch (Throwable t) {
                error.set(t);
            } finally {
                if (dialog != null) dialog.close();
                owner.close();
                latch.countDown();
            }
        });
        assertTrue(latch.await(15, TimeUnit.SECONDS));
        if (error.get() != null) fail("Account dialog failed: " + error.get());
    }

    @Test
    public void testHistoryViewInstantiation() throws Exception {
        AtomicReference<Throwable> error = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);

        Platform.runLater(() -> {
            try {
                HistoryView view = new HistoryView();
                assertNotNull(view);
            } catch (Throwable t) {
                error.set(t);
            } finally {
                latch.countDown();
            }
        });

        assertTrue(latch.await(15, TimeUnit.SECONDS));
        if (error.get() != null) {
            error.get().printStackTrace();
            fail("HistoryView instantiation failed: " + error.get().getMessage());
        }
    }

    @Test
    public void testSettingsViewInstantiation() throws Exception {
        AtomicReference<Throwable> error = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);

        Platform.runLater(() -> {
            try {
                NativeExifToolEngine engine = new NativeExifToolEngine();
                SettingsView view = new SettingsView(engine);
                assertNotNull(view);
                HBox body = (HBox) view.getChildren().get(1);
                VBox navigation = (VBox) body.getChildren().get(0);
                ListView<?> categories = (ListView<?>) navigation.getChildren().get(0);
                ScrollPane scroll = (ScrollPane) body.getChildren().get(1);
                StackPane content = (StackPane) scroll.getContent();
                assertEquals(5, categories.getItems().size());
                String[][] categoriesToCheck = {
                        {"User Profile", "Account"}, {"Updates", "General"},
                        {"File Safety", "Restoration"}, {"Privacy", "Privacy"}, {"About", "Help & About"}
                };
                for (String[] category : categoriesToCheck) {
                    scroll.setVvalue(1);
                    view.selectCategory(category[0]);
                    assertEquals(1, content.getChildren().size());
                    assertEquals(category[1], categories.getSelectionModel().getSelectedItem());
                    if (!category[1].equals("Account")) assertEquals(0, scroll.getVvalue());
                }
            } catch (Throwable t) {
                error.set(t);
            } finally {
                latch.countDown();
            }
        });

        assertTrue(latch.await(15, TimeUnit.SECONDS));
        if (error.get() != null) {
            error.get().printStackTrace();
            fail("SettingsView instantiation failed: " + error.get().getMessage());
        }
    }
}
