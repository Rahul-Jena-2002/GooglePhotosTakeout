package com.takeoutfix;

import com.takeoutfix.shared.theme.AppTheme;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ThemeNamesTest {
    @Test
    void simpleAndPreviousLabelsResolveToTheSameThemes() {
        assertEquals("Dark", AppTheme.TAKEOUTFIX_DARK.getDisplayName());
        assertEquals("Light", AppTheme.TAKEOUTFIX_LIGHT.getDisplayName());
        assertEquals(AppTheme.TAKEOUTFIX_DARK, AppTheme.fromDisplayName("TakeoutFix Dark"));
        assertEquals(AppTheme.TAKEOUTFIX_LIGHT, AppTheme.fromDisplayName("TakeoutFix Light"));
        assertEquals(AppTheme.TAKEOUTFIX_LIGHT, AppTheme.fromDisplayName("TAKEOUTFIX_LIGHT"));
    }
}
