package com.takeoutfix.ui.fx;

import javafx.scene.Node;
import javafx.scene.layout.VBox;

import java.util.*;

/**
 * Responsive, zero-reconstruction container for draggable dashboard cards.
 * Maintains persistent card nodes in-memory, updating scene graph layout order
 * without destroying or rebuilding inner interactive controls, telemetry graphs, or event listeners.
 */
public class DraggableCardGrid extends VBox {

    private final DashboardLayoutStore layoutStore;
    private final Map<String, DashboardCard> cardRegistry = new LinkedHashMap<>();

    public DraggableCardGrid(DashboardLayoutStore layoutStore) {
        this.layoutStore = layoutStore;
        setSpacing(18);

        // Listen for layout order or visibility changes from the central store
        this.layoutStore.addChangeListener(store -> refreshLayout());
    }

    /**
     * Registers a dashboard section card with its unique ID and content.
     */
    public void registerCard(String cardId, String title, Node contentNode) {
        DashboardCard card = new DashboardCard(cardId, title, contentNode, this, layoutStore);
        cardRegistry.put(cardId, card);
    }

    /**
     * Re-orders scene-graph child nodes to match layoutStore active order and visibility.
     * Operates purely via pointer reassignment (getChildren().setAll) to retain state and avoid GC churn.
     */
    public void refreshLayout() {
        List<DashboardCard> visibleCards = new ArrayList<>();
        for (String id : layoutStore.getActiveCardOrder()) {
            if (layoutStore.isCardVisible(id)) {
                DashboardCard card = cardRegistry.get(id);
                if (card != null) {
                    visibleCards.add(card);
                }
            }
        }
        getChildren().setAll(visibleCards);
    }

    /**
     * Calculates deterministic insertion index when a card is dropped above or below a target.
     * Prevents common off-by-one shifting bugs when source is before/after target.
     */
    public void handleCardDrop(String draggedId, String targetCardId, boolean insertAfter) {
        if (draggedId == null || targetCardId == null || draggedId.equals(targetCardId)) {
            return;
        }

        List<String> currentOrder = new ArrayList<>(layoutStore.getActiveCardOrder());
        int sourceIdx = currentOrder.indexOf(draggedId);
        int targetIdx = currentOrder.indexOf(targetCardId);

        if (sourceIdx < 0 || targetIdx < 0) {
            return;
        }

        int destinationIdx = insertAfter ? targetIdx + 1 : targetIdx;

        // If the source was before the target, removing it shifts indices down by 1
        if (sourceIdx < destinationIdx) {
            destinationIdx--;
        }

        layoutStore.moveCard(draggedId, destinationIdx);
    }

    /**
     * Clears all drop indicators across registered cards.
     */
    public void clearDropIndicators() {
        for (DashboardCard card : cardRegistry.values()) {
            card.clearDropIndicator();
        }
    }

    public DashboardCard getCard(String cardId) {
        return cardRegistry.get(cardId);
    }
}
