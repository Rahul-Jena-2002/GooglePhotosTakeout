package com.takeoutfix.ui.fx;

import javafx.application.Platform;
import javafx.scene.control.Label;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.*;

public class DashboardDraggableCardsTest {

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

    @BeforeEach
    public void setup() {
        DashboardPreferences.resetDefaults();
    }

    @Test
    public void testPreferencesFallbackAndDeduplication() {
        List<String> defaultOrder = List.of("telemetry", "kpi", "workflows", "activity");

        // Null / empty fallback
        List<String> loaded = DashboardPreferences.loadCardOrder(defaultOrder);
        assertEquals(defaultOrder, loaded);

        // Save custom order
        List<String> custom = List.of("workflows", "kpi", "activity", "telemetry");
        DashboardPreferences.saveCardOrder(custom);
        assertEquals(custom, DashboardPreferences.loadCardOrder(defaultOrder));

        // Test with unknown and duplicate items
        DashboardPreferences.saveCardOrder(List.of("kpi", "unknown_1", "kpi", "activity", "invalid"));
        List<String> sanitized = DashboardPreferences.loadCardOrder(defaultOrder);
        // Valid seen: kpi, activity. Missing defaults: telemetry, workflows
        assertTrue(sanitized.containsAll(defaultOrder));
        assertEquals(4, sanitized.size());
        assertEquals("kpi", sanitized.get(0));
        assertEquals("activity", sanitized.get(1));
    }

    @Test
    public void testLayoutStoreDeterministicMoving() {
        DashboardLayoutStore store = new DashboardLayoutStore();
        store.resetToDefault();

        // Default order: telemetry(0), kpi(1), workflows(2), activity(3)
        List<String> initial = List.copyOf(store.getActiveCardOrder());
        assertEquals(List.of("telemetry", "kpi", "workflows", "activity"), initial);

        // Move telemetry(0) to target index 2 (between workflows and activity)
        store.moveCard("telemetry", 2);
        assertEquals(List.of("kpi", "workflows", "telemetry", "activity"), store.getActiveCardOrder());

        // Move activity(3) to position 0 (first)
        store.moveCard("activity", 0);
        assertEquals(List.of("activity", "kpi", "workflows", "telemetry"), store.getActiveCardOrder());

        // Dropping on itself should be a no-op
        store.moveCard("activity", 0);
        assertEquals(List.of("activity", "kpi", "workflows", "telemetry"), store.getActiveCardOrder());

        // Out-of-bounds target indices should clamp safely
        store.moveCard("activity", 999);
        assertEquals("activity", store.getActiveCardOrder().get(3));

        store.moveCard("activity", -10);
        assertEquals("activity", store.getActiveCardOrder().get(0));
    }

    @Test
    public void testMoveUpAndDownAccessibility() {
        DashboardLayoutStore store = new DashboardLayoutStore();
        store.resetToDefault();

        // telemetry is first: moveUp should return false and not alter order
        assertFalse(store.moveUp("telemetry"));
        assertEquals("telemetry", store.getActiveCardOrder().get(0));

        // kpi is at index 1: moveUp should move it to index 0
        assertTrue(store.moveUp("kpi"));
        assertEquals("kpi", store.getActiveCardOrder().get(0));
        assertEquals("telemetry", store.getActiveCardOrder().get(1));

        // activity is at the end: moveDown should return false
        assertFalse(store.moveDown("activity"));
        assertEquals("activity", store.getActiveCardOrder().get(store.getActiveCardOrder().size() - 1));

        // workflows moveDown should swap with activity
        assertTrue(store.moveDown("workflows"));
        assertEquals("workflows", store.getActiveCardOrder().get(3));
    }

    @Test
    public void testCardVisibilityToggling() {
        DashboardLayoutStore store = new DashboardLayoutStore();
        store.resetToDefault();

        assertTrue(store.isCardVisible("telemetry"));

        // Hide telemetry
        store.setCardVisible("telemetry", false);
        assertFalse(store.isCardVisible("telemetry"));

        // Active order still retains telemetry position for clean unhiding
        assertTrue(store.getActiveCardOrder().contains("telemetry"));

        // Unhide telemetry
        store.setCardVisible("telemetry", true);
        assertTrue(store.isCardVisible("telemetry"));
    }

    @Test
    public void testDraggableCardGridZeroReconstruction() throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicBoolean success = new AtomicBoolean(false);

        Platform.runLater(() -> {
            try {
                DashboardLayoutStore store = new DashboardLayoutStore();
                store.resetToDefault();

                DraggableCardGrid grid = new DraggableCardGrid(store);

                Label label1 = new Label("Node 1 Content");
                Label label2 = new Label("Node 2 Content");
                Label label3 = new Label("Node 3 Content");
                Label label4 = new Label("Node 4 Content");

                grid.registerCard("telemetry", "Telemetry", label1);
                grid.registerCard("kpi", "KPI", label2);
                grid.registerCard("workflows", "Workflows", label3);
                grid.registerCard("activity", "Activity", label4);

                grid.refreshLayout();
                assertEquals(4, grid.getChildren().size());

                DashboardCard card0 = (DashboardCard) grid.getChildren().get(0);
                assertSame(label1, card0.getContentNode(), "Child node instance must remain untouched");

                // Simulate drag drop: workflows moved before telemetry (insertAfter = false)
                grid.handleCardDrop("workflows", "telemetry", false);

                assertEquals(4, grid.getChildren().size());
                DashboardCard newFirst = (DashboardCard) grid.getChildren().get(0);
                assertEquals("workflows", newFirst.getCardId());
                assertSame(label3, newFirst.getContentNode(), "Node instance must not be recreated or garbage collected");

                // Test hiding a card: grid child count reduces without losing registered instances
                store.setCardVisible("kpi", false);
                grid.refreshLayout();
                assertEquals(3, grid.getChildren().size());

                store.setCardVisible("kpi", true);
                grid.refreshLayout();
                assertEquals(4, grid.getChildren().size());

                success.set(true);
            } catch (Throwable t) {
                t.printStackTrace();
            } finally {
                latch.countDown();
            }
        });

        assertTrue(latch.await(5, TimeUnit.SECONDS));
        assertTrue(success.get(), "DraggableCardGrid verified without exceptions");
    }
}
