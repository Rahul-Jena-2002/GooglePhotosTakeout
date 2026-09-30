package com.takeoutfix;

import com.takeoutfix.metasync.core.MetadataSyncService;
import com.takeoutfix.metasync.ui.MetaSyncView;
import com.takeoutfix.restore.infrastructure.NativeExifToolEngine;
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
public class MetaSyncViewTest {

    @BeforeAll
    public static void initJfx() throws InterruptedException {
        CountDownLatch latch = new CountDownLatch(1);
        try {
            Platform.startup(latch::countDown);
        } catch (IllegalStateException alreadyStarted) {
            latch.countDown();
        }
        assertTrue(latch.await(5, TimeUnit.SECONDS));
    }

    @Test
    public void testMetaSyncViewInstantiation() throws Exception {
        AtomicReference<Throwable> error = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);

        Platform.runLater(() -> {
            try {
                NativeExifToolEngine engine = new NativeExifToolEngine();
                MetadataSyncService syncService = new MetadataSyncService(engine);
                MetaSyncView view = new MetaSyncView(null, syncService);
                assertNotNull(view);
            } catch (Throwable t) {
                error.set(t);
            } finally {
                latch.countDown();
            }
        });

        assertTrue(latch.await(5, TimeUnit.SECONDS));
        if (error.get() != null) {
            error.get().printStackTrace();
            fail("MetaSyncView instantiation failed: " + error.get().getMessage());
        }
    }
}
