package com.takeoutfix.auth;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

public class SessionManagerTest {

    @TempDir
    Path tempDir;

    private CredentialStore credentialStore;
    private SessionManager sessionManager;

    @BeforeEach
    public void setup() {
        credentialStore = new CredentialStore(tempDir.toFile());
        credentialStore.clear();
        sessionManager = new SessionManager(credentialStore, new FirebaseTokenService());
    }

    @AfterEach
    public void tearDown() {
        if (credentialStore != null) {
            credentialStore.clear();
        }
    }

    @Test
    public void testEmptyStartupRestorationReturnsUnauthenticated() {
        SessionRestoreResult result = sessionManager.restore();
        assertNotNull(result);
        assertInstanceOf(SessionRestoreResult.RequiresLogin.class, result);
        assertFalse(result.isAuthenticated());
        assertFalse(sessionManager.isAuthenticated());
    }

    @Test
    public void testSaveAndLogoutSession() {
        String testEmail = "session-test-" + java.util.UUID.randomUUID() + "@example.invalid";
        AuthSession session = new AuthSession(
                "uid-abc",
                testEmail,
                "Hello World",
                "",
                "dummyIdToken",
                "dummyRefreshToken",
                "pro",
                System.currentTimeMillis() + 3600_000L
        );

        sessionManager.save(session);
        assertTrue(sessionManager.isAuthenticated());
        assertEquals(testEmail, sessionManager.getCurrentSession().getEmail());
        assertEquals("pro", sessionManager.getCurrentSession().getPlan());

        // Logout
        sessionManager.logout();
        assertFalse(sessionManager.isAuthenticated());
        assertFalse(sessionManager.getCurrentSession().isAuthenticated());
    }

    @Test
    public void logoutReportsCleanupFailureAndClearsActiveSession() {
        CredentialStore failingStore = new CredentialStore(tempDir.toFile()) {
            @Override public synchronized void saveSession(AuthSession session) { assertNotNull(session); }
            @Override public synchronized boolean clear() { return false; }
        };
        SessionManager manager = new SessionManager(failingStore, new FirebaseTokenService());
        manager.save(new AuthSession("uid", "user@example.invalid", "User", "", "id", "refresh", "free", 0));
        assertFalse(manager.logout());
        assertFalse(manager.isAuthenticated());
    }

    @Test
    public void logoutNotifiesListenersWhenCleanupThrows() {
        CredentialStore failingStore = new CredentialStore(tempDir.toFile()) {
            @Override public synchronized void saveSession(AuthSession session) { assertNotNull(session); }
            @Override public synchronized boolean clear() { throw new IllegalStateException("storage unavailable"); }
        };
        SessionManager manager = new SessionManager(failingStore, new FirebaseTokenService());
        manager.save(new AuthSession("uid", "user@example.invalid", "User", "", "id", "refresh", "free", 0));
        var notified = new java.util.concurrent.atomic.AtomicBoolean();
        manager.addSessionListener(session -> { if (!session.isAuthenticated()) notified.set(true); });
        assertThrows(IllegalStateException.class, manager::logout);
        assertFalse(manager.isAuthenticated());
        assertTrue(notified.get());
    }

    @Test
    public void failedStorageDoesNotActivateSession() {
        CredentialStore failingStore = new CredentialStore(tempDir.toFile()) {
            @Override public synchronized void saveSession(AuthSession session) {
                throw new IllegalStateException("storage unavailable");
            }
        };
        SessionManager manager = new SessionManager(failingStore, new FirebaseTokenService());
        AuthSession session = new AuthSession("uid", "user@example.invalid", "User", "", "id", "refresh", "free", 0);
        assertThrows(IllegalStateException.class, () -> manager.save(session));
        assertFalse(manager.isAuthenticated());
    }
}
