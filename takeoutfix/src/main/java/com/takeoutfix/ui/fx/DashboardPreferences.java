package com.takeoutfix.ui.fx;

import java.util.*;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.prefs.BackingStoreException;
import java.util.prefs.Preferences;

/**
 * Robust, zero-dependency persistence layer for TakeoutFix Dashboard layout.
 * Uses standard java.util.prefs.Preferences with defensive validation:
 * - Deduplication and pruning of legacy/unknown IDs
 * - Safe fallback to defaults on corruption or backing store failure
 * - Atomic persistence of order and visibility
 */
public final class DashboardPreferences {

    private static final Logger LOGGER = Logger.getLogger(DashboardPreferences.class.getName());

    private static final String PREF_VERSION_KEY = "dashboard.layout.version";
    private static final String PREF_ORDER_KEY = "dashboard.card.order";
    private static final String PREF_HIDDEN_KEY = "dashboard.card.hidden";
    private static final int CURRENT_VERSION = 1;

    private DashboardPreferences() {}

    private static Preferences getPrefs() {
        return Preferences.userNodeForPackage(DashboardPreferences.class);
    }

    /**
     * Loads saved card order safely, merging with defaultOrder:
     * 1. Preserves user preference order for existing valid cards.
     * 2. Prunes any unknown/deprecated IDs.
     * 3. Appends any newly introduced card IDs at the end in their default order.
     * 4. Deduplicates gracefully.
     */
    public static List<String> loadCardOrder(List<String> defaultOrder) {
        if (defaultOrder == null || defaultOrder.isEmpty()) {
            return Collections.emptyList();
        }

        try {
            Preferences prefs = getPrefs();
            String rawOrder = prefs.get(PREF_ORDER_KEY, null);
            if (rawOrder == null || rawOrder.trim().isEmpty()) {
                return new ArrayList<>(defaultOrder);
            }

            Set<String> supportedSet = new HashSet<>(defaultOrder);
            Set<String> seen = new HashSet<>();
            List<String> sanitizedOrder = new ArrayList<>();

            String[] tokens = rawOrder.split(",");
            for (String token : tokens) {
                String id = token.trim();
                if (!id.isEmpty() && supportedSet.contains(id) && seen.add(id)) {
                    sanitizedOrder.add(id);
                }
            }

            // Append any valid cards that were not present in stored preferences
            for (String defaultId : defaultOrder) {
                if (seen.add(defaultId)) {
                    sanitizedOrder.add(defaultId);
                }
            }

            return sanitizedOrder.isEmpty() ? new ArrayList<>(defaultOrder) : sanitizedOrder;
        } catch (Exception ex) {
            LOGGER.log(Level.WARNING, "Failed to read dashboard card order from Preferences, falling back to defaults", ex);
            return new ArrayList<>(defaultOrder);
        }
    }

    /**
     * Saves the current card order into Preferences.
     */
    public static void saveCardOrder(List<String> order) {
        if (order == null || order.isEmpty()) {
            return;
        }
        try {
            Preferences prefs = getPrefs();
            prefs.putInt(PREF_VERSION_KEY, CURRENT_VERSION);
            prefs.put(PREF_ORDER_KEY, String.join(",", order));
            prefs.flush();
        } catch (Exception ex) {
            LOGGER.log(Level.WARNING, "Failed to persist dashboard card order", ex);
        }
    }

    /**
     * Loads the set of hidden card IDs.
     */
    public static Set<String> loadHiddenCards(Set<String> supportedIds) {
        Set<String> hidden = new HashSet<>();
        try {
            Preferences prefs = getPrefs();
            String rawHidden = prefs.get(PREF_HIDDEN_KEY, "");
            if (rawHidden != null && !rawHidden.trim().isEmpty()) {
                for (String token : rawHidden.split(",")) {
                    String id = token.trim();
                    if (!id.isEmpty() && supportedIds.contains(id)) {
                        hidden.add(id);
                    }
                }
            }
        } catch (Exception ex) {
            LOGGER.log(Level.WARNING, "Failed to read hidden card preferences", ex);
        }
        return hidden;
    }

    /**
     * Saves the set of hidden card IDs.
     */
    public static void saveHiddenCards(Set<String> hidden) {
        try {
            Preferences prefs = getPrefs();
            prefs.putInt(PREF_VERSION_KEY, CURRENT_VERSION);
            if (hidden == null || hidden.isEmpty()) {
                prefs.put(PREF_HIDDEN_KEY, "");
            } else {
                prefs.put(PREF_HIDDEN_KEY, String.join(",", hidden));
            }
            prefs.flush();
        } catch (Exception ex) {
            LOGGER.log(Level.WARNING, "Failed to persist hidden card preferences", ex);
        }
    }

    /**
     * Resets dashboard layout preferences to factory defaults.
     */
    public static void resetDefaults() {
        try {
            Preferences prefs = getPrefs();
            prefs.remove(PREF_ORDER_KEY);
            prefs.remove(PREF_HIDDEN_KEY);
            prefs.remove(PREF_VERSION_KEY);
            prefs.flush();
        } catch (BackingStoreException ex) {
            LOGGER.log(Level.WARNING, "Failed to clear dashboard preferences", ex);
        }
    }
}
