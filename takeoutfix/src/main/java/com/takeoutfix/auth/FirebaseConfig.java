package com.takeoutfix.auth;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.util.Properties;

/**
 * Resolves Firebase configuration dynamically without hardcoded keys in source control.
 * Resolution precedence:
 * 1. Environment variables: FIREBASE_WEB_API_KEY, FIREBASE_PROJECT_ID
 * 2. System properties: -Dfirebase.web.api.key=..., -Dfirebase.project.id=...
 * 3. User config file: ~/.takeoutfix/config.properties
 * 4. Classpath resource: credentials.properties (gitignored)
 */
public final class FirebaseConfig {

    private static final String DEFAULT_PROJECT_ID = "takeout-fix";
    private static final String DEFAULT_GOOGLE_CLIENT_ID = "";
    private static final String DEFAULT_GOOGLE_CLIENT_SECRET = "";

    private static String apiKey;
    private static String projectId;
    private static String googleClientId;
    private static String googleClientSecret;

    static {
        loadConfig();
    }

    private FirebaseConfig() {}

    private static synchronized void loadConfig() {
        // 1. Check environment variables
        apiKey = System.getenv("FIREBASE_WEB_API_KEY");
        projectId = System.getenv("FIREBASE_PROJECT_ID");
        googleClientId = System.getenv("GOOGLE_OAUTH_CLIENT_ID");
        googleClientSecret = System.getenv("GOOGLE_OAUTH_CLIENT_SECRET");

        // 2. Check system properties
        if (apiKey == null || apiKey.isBlank()) {
            apiKey = System.getProperty("firebase.web.api.key");
        }
        if (projectId == null || projectId.isBlank()) {
            projectId = System.getProperty("firebase.project.id");
        }
        if (googleClientId == null || googleClientId.isBlank()) {
            googleClientId = System.getProperty("google.oauth.client.id");
        }
        if (googleClientSecret == null || googleClientSecret.isBlank()) {
            googleClientSecret = System.getProperty("google.oauth.client.secret");
        }

        // 3. Check user config file: ~/.takeoutfix/config.properties
        if (isAnyMissing()) {
            File userConfigFile = new File(System.getProperty("user.home"), ".takeoutfix/config.properties");
            if (userConfigFile.exists()) {
                try (InputStream in = new FileInputStream(userConfigFile)) {
                    Properties props = new Properties();
                    props.load(in);
                    applyProperties(props);
                } catch (Exception ignored) {}
            }
        }

        // 4. Check classpath resource (credentials.properties)
        if (isAnyMissing()) {
            try (InputStream in = FirebaseConfig.class.getClassLoader().getResourceAsStream("credentials.properties")) {
                if (in != null) {
                    Properties props = new Properties();
                    props.load(in);
                    applyProperties(props);
                }
            } catch (Exception ignored) {}
        }

        if (apiKey == null) apiKey = "";
        if (projectId == null || projectId.isBlank()) projectId = DEFAULT_PROJECT_ID;
        if (googleClientId == null || googleClientId.isBlank()) googleClientId = DEFAULT_GOOGLE_CLIENT_ID;
        if (googleClientSecret == null || googleClientSecret.isBlank()) googleClientSecret = DEFAULT_GOOGLE_CLIENT_SECRET;
    }

    private static boolean isAnyMissing() {
        return apiKey == null || apiKey.isBlank()
                || projectId == null || projectId.isBlank()
                || googleClientId == null || googleClientId.isBlank()
                || googleClientSecret == null || googleClientSecret.isBlank();
    }

    private static void applyProperties(Properties props) {
        if (apiKey == null || apiKey.isBlank()) {
            apiKey = props.getProperty("firebase.web.api.key");
        }
        if (projectId == null || projectId.isBlank()) {
            projectId = props.getProperty("firebase.project.id");
        }
        if (googleClientId == null || googleClientId.isBlank()) {
            googleClientId = props.getProperty("google.oauth.client.id");
        }
        if (googleClientSecret == null || googleClientSecret.isBlank()) {
            googleClientSecret = props.getProperty("google.oauth.client.secret");
        }
    }

    public static String getApiKey() {
        if (apiKey == null || apiKey.isBlank()) {
            loadConfig();
        }
        return apiKey;
    }

    public static String getProjectId() {
        if (projectId == null || projectId.isBlank()) {
            loadConfig();
        }
        return projectId;
    }

    public static String getGoogleClientId() {
        if (googleClientId == null || googleClientId.isBlank()) {
            loadConfig();
        }
        return googleClientId;
    }

    public static String getGoogleClientSecret() {
        if (googleClientSecret == null || googleClientSecret.isBlank()) {
            loadConfig();
        }
        return googleClientSecret;
    }
}
