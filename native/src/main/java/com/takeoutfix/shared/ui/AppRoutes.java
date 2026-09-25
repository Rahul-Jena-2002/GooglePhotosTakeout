package com.takeoutfix.shared.ui;

/**
 * Navigation route constants used to identify panels in the app's CardLayout.
 * Shared across all modules — no module needs to import another module for routing.
 */
public final class AppRoutes {
    private AppRoutes() {}

    public static final String RESTORE    = "Photo Metadata Restorer";
    public static final String DASHBOARD  = "Operations Dashboard";
    public static final String EXIF       = "EXIF Viewer (BETA)";
    public static final String COMPARE    = "Archive Compare (BETA)";
    public static final String DUPLICATE  = "Duplicate Finder (BETA)";
    public static final String AUTH_REQUIRED     = "Sign In Required";
    public static final String AUTHENTICATING    = "Authenticating Session";
}
