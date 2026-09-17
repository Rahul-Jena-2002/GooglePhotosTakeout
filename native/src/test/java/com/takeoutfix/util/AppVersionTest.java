package com.takeoutfix.util;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

public class AppVersionTest {

    @Test
    public void testVersionLoading() {
        assertNotNull(AppVersion.getVersion());
        assertTrue(AppVersion.getBuildNumber() > 0);
        assertTrue(AppVersion.getFullVersionString().startsWith("v"));
    }

    @Test
    public void testVersionComparison() {
        assertTrue(AppVersion.compareVersions("2.0.3", "2.0.2") > 0);
        assertTrue(AppVersion.compareVersions("v2.1.0", "2.0.9") > 0);
        assertTrue(AppVersion.compareVersions("2.0.2", "2.0.2") == 0);
        assertTrue(AppVersion.compareVersions("2.0.1", "2.0.2") < 0);
        assertTrue(AppVersion.compareVersions("1.9.9", "2.0.0") < 0);
    }
}
