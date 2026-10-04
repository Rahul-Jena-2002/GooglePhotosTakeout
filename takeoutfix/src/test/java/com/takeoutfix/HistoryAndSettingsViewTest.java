package com.takeoutfix;

import com.takeoutfix.restore.infrastructure.NativeExifToolEngine;
import com.takeoutfix.ui.fx.HistoryView;
import com.takeoutfix.ui.fx.SettingsView;
import javafx.application.Platform;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;

import static org.junit.jupiter.api.Assertions.assertNotNull;
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
