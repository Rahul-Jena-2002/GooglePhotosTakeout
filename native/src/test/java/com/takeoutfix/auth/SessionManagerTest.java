package com.takeoutfix.auth;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

public class SessionManagerTest {

    private CredentialStore credentialStore;
    private SessionManager sessionManager;

    @BeforeEach
    public void setup() {
        credentialStore = new CredentialStore();
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
        AuthSession session = new AuthSession(
                "uid-abc",
                "hello@gmail.com",
                "Hello World",
                "",
                "dummyIdToken",
                "dummyRefreshToken",
                "pro",
                System.currentTimeMillis() + 3600_000L
        );

        sessionManager.save(session);
        assertTrue(sessionManager.isAuthenticated());
        assertEquals("hello@gmail.com", sessionManager.getCurrentSession().getEmail());
        assertEquals("pro", sessionManager.getCurrentSession().getPlan());

        // Logout
        sessionManager.logout();
        assertFalse(sessionManager.isAuthenticated());
        assertFalse(sessionManager.getCurrentSession().isAuthenticated());
    }
}
