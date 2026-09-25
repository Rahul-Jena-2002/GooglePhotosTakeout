package com.takeoutfix.auth;

import com.takeoutfix.ads.AdSyncService;
import com.takeoutfix.app.ApplicationStartupController;
import com.takeoutfix.network.NetworkMonitorService;
import com.takeoutfix.restore.SessionStatsService;
import com.takeoutfix.restore.infrastructure.ExtractionService;
import com.takeoutfix.ui.auth.SignInView;
import org.json.JSONObject;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Token-Based Auth Architecture Verification (VS Code / Android Studio Specification)")
class TokenAuthArchitectureVerificationTest {

    private static final File CONFIG_DIR = new File(System.getProperty("user.home"), ".takeoutfix");
    private static final File SESSION_FILE = new File(CONFIG_DIR, "session.json");

    private CredentialStore credentialStore;
    private UserSyncBridgeService userService;

    @BeforeEach
    void setup() {
        System.setProperty("java.awt.headless", "true");
        credentialStore = new CredentialStore();
        credentialStore.clear();
        UserController.logout();
        userService = new UserSyncBridgeService();
    }

    @AfterEach
    void tearDown() {
        if (credentialStore != null) {
            credentialStore.clear();
        }
        UserController.logout();
    }

    @Test
    @DisplayName("VERIFY 1: Fresh install, no session.json -> Opens DashboardView in Guest Mode")
    void testFreshInstallShowsSignInDialog() {
        assertFalse(SESSION_FILE.exists());
        assertFalse(credentialStore.hasStoredCredential());

        ApplicationStartupController controller = new ApplicationStartupController(
                userService,
                new ExtractionService(),
                new SessionStatsService(),
                new NetworkMonitorService(),
                new AdSyncService()
        );

        controller.startApplication();

        // Must display DashboardView in Guest Mode on fresh launch without credentials
        assertNotNull(controller.getCurrentView());
        assertTrue(controller.getCurrentView() instanceof com.takeoutfix.ui.dashboard.DashboardView,
                "Fresh install must render DashboardView in Guest Mode");
        assertFalse(controller.isAuthenticated(), "Must be in unauthenticated / guest state");
        assertFalse(userService.isSignedIn(), "User service must be signed out in guest mode");
    }

    @Test
    @DisplayName("VERIFY 2 & 3: CredentialStore secures tokens via OS Keyring and keeps session.json free of plaintext tokens")
    void testTokensPersistedToSessionJson() throws Exception {
        AuthSession session = new AuthSession(
                "firebase-local-uid-100",
                "developer@takeoutfix.com",
                "Developer",
                "https://photos.google.com/icon.png",
                "jwt-id-token-abc-123",
                "durable-refresh-token-xyz-789",
                "pro",
                System.currentTimeMillis() + 3600_000L
        );

        credentialStore.saveSession(session);

        assertTrue(SESSION_FILE.exists(), "session.json must exist after saveSession");
        String content = Files.readString(SESSION_FILE.toPath(), StandardCharsets.UTF_8);
        JSONObject json = new JSONObject(content);

        // Security assertion: Plaintext refreshToken is NOT written to session.json
        assertFalse(json.has("refreshToken"), "Plaintext refreshToken must NOT be stored in session.json");
        assertEquals("developer@takeoutfix.com", json.optString("email"));
        assertEquals("Developer", json.optString("displayName"));

        // When reloaded via CredentialStore, tokens are loaded from OS Keyring / Secure Vault
        AuthSession loaded = credentialStore.loadSession();
        assertNotNull(loaded);
        assertEquals("jwt-id-token-abc-123", loaded.getIdToken());
        assertEquals("durable-refresh-token-xyz-789", loaded.getRefreshToken());
    }

    @Test
    @DisplayName("VERIFY 4: Silent re-auth hits securetoken endpoint and restores session into DashboardView")
    void testSilentStartupRestoration() {
        // Pre-populate valid session with refreshToken
        AuthSession storedSession = new AuthSession(
                "uid-restore-test",
                "reauth@takeoutfix.com",
                "Reauth User",
                "",
                "old-expired-id-token",
                "valid-refresh-token",
                "super",
                System.currentTimeMillis() - 1000L // Expired ID token
        );
        credentialStore.saveSession(storedSession);

        AtomicBoolean hitSecureTokenOnly = new AtomicBoolean(false);

        // Mock token service simulating securetoken.googleapis.com refresh
        FirebaseTokenService mockTokenService = new FirebaseTokenService() {
            @Override
            public AuthSession refreshAndVerify(AuthSession session) throws AuthException {
                hitSecureTokenOnly.set(true);
                return session.withNewTokens("brand-new-id-token", "valid-refresh-token", System.currentTimeMillis() + 3600_000L, "super");
            }
        };

        SessionManager sessionManager = new SessionManager(credentialStore, mockTokenService);
        SessionRestoreResult result = sessionManager.restore();

        assertTrue(result instanceof SessionRestoreResult.Authenticated);
        assertTrue(hitSecureTokenOnly.get(), "Must execute silent re-auth without opening a browser");

        AuthSession restored = ((SessionRestoreResult.Authenticated) result).session();
        assertEquals("brand-new-id-token", restored.getIdToken());
        assertEquals("valid-refresh-token", restored.getRefreshToken());
        assertEquals("reauth@takeoutfix.com", restored.getEmail());
    }

    @Test
    @DisplayName("VERIFY 5: Corrupt/expired refreshToken in session.json -> fails refresh, session.json cleared")
    void testCorruptedRefreshTokenClearsSessionJson() {
        // Seed corrupt refreshToken in session.json
        AuthSession corruptSession = new AuthSession(
                "uid-corrupted",
                "corrupt@takeoutfix.com",
                "Corrupt User",
                "",
                "stale-id-token",
                "corrupted-invalid-refresh-token",
                "free",
                0L
        );
        credentialStore.saveSession(corruptSession);
        assertTrue(SESSION_FILE.exists());

        // Token service returning 400 Bad Request / INVALID_REFRESH_TOKEN
        FirebaseTokenService mockTokenService = new FirebaseTokenService() {
            @Override
            public AuthSession refreshAndVerify(AuthSession session) throws AuthException {
                throw new AuthException("Firebase refresh token rejected (HTTP 400): {\"error\":{\"message\":\"INVALID_REFRESH_TOKEN\"}}");
            }
        };

        SessionManager sessionManager = new SessionManager(credentialStore, mockTokenService);
        SessionRestoreResult result = sessionManager.restore();

        // Must require login and wipe corrupted credentials
        assertInstanceOf(SessionRestoreResult.RequiresLogin.class, result);
        assertFalse(sessionManager.isAuthenticated());
        assertFalse(SESSION_FILE.exists(), "session.json must be deleted when refresh token is rejected");
        assertFalse(credentialStore.hasStoredCredential());
    }

    @Test
    @DisplayName("VERIFY 6: Logout deletes session.json completely; next launch requires sign-in")
    void testLogoutClearsSessionAndEnforcesSignIn() {
        // Seed active session
        AuthSession active = new AuthSession(
                "uid-logout-test",
                "logout@takeoutfix.com",
                "Logout User",
                "",
                "valid-token",
                "valid-refresh",
                "pro",
                System.currentTimeMillis() + 3600_000L
        );
        credentialStore.saveSession(active);
        UserController.syncUser(active.toMap());
        assertTrue(SESSION_FILE.exists());
        assertTrue(userService.isSignedIn());

        // Trigger sign out
        userService.signOut();

        assertFalse(SESSION_FILE.exists(), "session.json must be deleted completely on sign out");
        assertFalse(credentialStore.hasStoredCredential());
        assertFalse(userService.isSignedIn());
        assertTrue(UserController.getCurrentUserProfile().isEmpty());

        // Verify next launch opens directly to DashboardView in Guest Mode
        ApplicationStartupController controller = new ApplicationStartupController(
                userService,
                new ExtractionService(),
                new SessionStatsService(),
                new NetworkMonitorService(),
                new AdSyncService()
        );

        controller.startApplication();
        assertNotNull(controller.getCurrentView());
        assertTrue(controller.getCurrentView() instanceof com.takeoutfix.ui.dashboard.DashboardView,
                "Relaunch after logout must display DashboardView in Guest Mode");
        assertFalse(controller.isAuthenticated(), "Must be in unauthenticated / guest state");
        assertFalse(userService.isSignedIn(), "User service must be signed out in guest mode");
    }
}
