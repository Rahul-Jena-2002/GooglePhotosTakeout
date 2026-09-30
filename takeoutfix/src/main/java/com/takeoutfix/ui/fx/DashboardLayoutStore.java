package com.takeoutfix.ui.fx;

import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;

import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;

/**
 * Single source of truth for TakeoutFix Dashboard layout, card ordering, and visibility.
 * Implements deterministic card movement with defensive index calculation,
 * preventing off-by-one and index-shifting regressions.
 */
public class DashboardLayoutStore {

    public record CardDefinition(String id, String title, String subtitle, boolean defaultVisible) {}

    public static final String CARD_TELEMETRY = "telemetry";
    public static final String CARD_KPI = "kpi";
    public static final String CARD_WORKFLOWS = "workflows";
    public static final String CARD_ACTIVITY = "activity";

    private final Map<String, CardDefinition> definitions = new LinkedHashMap<>();
    private final List<String> defaultOrder = new ArrayList<>();
    private final ObservableList<String> activeCardOrder = FXCollections.observableArrayList();
    private final Set<String> hiddenCardIds = new HashSet<>();
    private final List<Consumer<DashboardLayoutStore>> changeListeners = new CopyOnWriteArrayList<>();

    public DashboardLayoutStore() {
        registerDefault(new CardDefinition(
                CARD_TELEMETRY,
                "System & Processing Status",
                "Native ExifTool engine state, on-device privacy pill, and live hardware resource monitors.",
                true
        ));
        registerDefault(new CardDefinition(
                CARD_KPI,
                "Photography Metrics",
                "Data recovered, metadata timestamps repaired, files scanned, and overall integrity score.",
                true
        ));
        registerDefault(new CardDefinition(
                CARD_WORKFLOWS,
                "Photo Workflows & Tools",
                "Direct launchcards for metadata restore, batch editor, EXIF inspector, duplicate finder, and private vault.",
                true
        ));
        registerDefault(new CardDefinition(
                CARD_ACTIVITY,
                "Recent Activity",
                "Interactive session history, recent repair executions, and timestamp audit trail.",
                true
        ));

        loadLayout();
    }

    private void registerDefault(CardDefinition def) {
        definitions.put(def.id(), def);
        defaultOrder.add(def.id());
    }

    /**
     * Loads saved layout from Preferences with safe fallback to defaults.
     */
    public void loadLayout() {
        List<String> loadedOrder = DashboardPreferences.loadCardOrder(defaultOrder);
        activeCardOrder.setAll(loadedOrder);

        Set<String> loadedHidden = DashboardPreferences.loadHiddenCards(definitions.keySet());
        hiddenCardIds.clear();
        hiddenCardIds.addAll(loadedHidden);
    }

    /**
     * Reorders a card to the specified target position.
     * Safely handles index shifting by calculating destination consistently.
     *
     * @param cardId      the card to move
     * @param targetIndex the desired index (0 to size-1)
     */
    public synchronized void moveCard(String cardId, int targetIndex) {
        if (cardId == null || !definitions.containsKey(cardId)) {
            return;
        }

        int currentIndex = activeCardOrder.indexOf(cardId);
        if (currentIndex < 0) {
            return;
        }

        // Clamp target index between 0 and activeCardOrder.size() - 1
        int clampedTarget = Math.max(0, Math.min(targetIndex, activeCardOrder.size() - 1));
        if (currentIndex == clampedTarget) {
            return; // Dropped on itself or same position: no-op
        }

        activeCardOrder.remove(currentIndex);
        activeCardOrder.add(clampedTarget, cardId);

        DashboardPreferences.saveCardOrder(new ArrayList<>(activeCardOrder));
        notifyListeners();
    }

    /**
     * Moves a card one slot up (for keyboard accessibility).
     */
    public synchronized boolean moveUp(String cardId) {
        int idx = activeCardOrder.indexOf(cardId);
        if (idx > 0) {
            moveCard(cardId, idx - 1);
            return true;
        }
        return false;
    }

    /**
     * Moves a card one slot down (for keyboard accessibility).
     */
    public synchronized boolean moveDown(String cardId) {
        int idx = activeCardOrder.indexOf(cardId);
        if (idx >= 0 && idx < activeCardOrder.size() - 1) {
            moveCard(cardId, idx + 1);
            return true;
        }
        return false;
    }

    /**
     * Toggles visibility for a specific card.
     * Hiding a card retains its relative position in activeCardOrder so that
     * re-enabling it restores it in place.
     */
    public synchronized void setCardVisible(String cardId, boolean visible) {
        if (!definitions.containsKey(cardId)) {
            return;
        }

        if (visible) {
            hiddenCardIds.remove(cardId);
        } else {
            hiddenCardIds.add(cardId);
        }

        DashboardPreferences.saveHiddenCards(hiddenCardIds);
        notifyListeners();
    }

    public synchronized boolean isCardVisible(String cardId) {
        return definitions.containsKey(cardId) && !hiddenCardIds.contains(cardId);
    }

    /**
     * Restores factory default layout order and makes all cards visible.
     */
    public synchronized void resetToDefault() {
        activeCardOrder.setAll(defaultOrder);
        hiddenCardIds.clear();
        DashboardPreferences.resetDefaults();
        notifyListeners();
    }

    public ObservableList<String> getActiveCardOrder() {
        return activeCardOrder;
    }

    public List<CardDefinition> getAllDefinitions() {
        return Collections.unmodifiableList(new ArrayList<>(definitions.values()));
    }

    public CardDefinition getDefinition(String cardId) {
        return definitions.get(cardId);
    }

    public void addChangeListener(Consumer<DashboardLayoutStore> listener) {
        if (listener != null && !changeListeners.contains(listener)) {
            changeListeners.add(listener);
        }
    }

    public void removeChangeListener(Consumer<DashboardLayoutStore> listener) {
        changeListeners.remove(listener);
    }

    private void notifyListeners() {
        Runnable notifyTask = () -> {
            for (Consumer<DashboardLayoutStore> listener : changeListeners) {
                try {
                    listener.accept(this);
                } catch (Exception ex) {
                    // Prevent single listener crash from breaking others
                    ex.printStackTrace();
                }
            }
        };

        if (Platform.isFxApplicationThread()) {
            notifyTask.run();
        } else {
            Platform.runLater(notifyTask);
        }
    }
}
