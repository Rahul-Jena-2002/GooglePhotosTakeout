package com.takeoutfix.auth;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

public class CredentialStoreTest {

    private CredentialStore store;

    @BeforeEach
    public void setup() {
        store = new CredentialStore();
        store.clear();
    }

    @AfterEach
    public void tearDown() {
        if (store != null) {
            store.clear();
        }
    }

    @Test
    public void testSaveAndLoadSession() {
        AuthSession original = new AuthSession(
                "uid-test-456",
                "testuser@gmail.com",
                "Test User",
                "https://photos.google.com/icon.png",
                "id-token-secure-123",
                "refresh-token-secret-789",
                "super",
                System.currentTimeMillis() + 3600_000
        );

        store.saveSession(original);

        assertTrue(store.hasStoredCredential());

        AuthSession loaded = store.loadSession();
        assertNotNull(loaded);
        assertEquals(original.getUid(), loaded.getUid());
        assertEquals(original.getEmail(), loaded.getEmail());
        assertEquals(original.getDisplayName(), loaded.getDisplayName());
        assertEquals(original.getPlan(), loaded.getPlan());
        // Verify tokens are persisted to session.json
        assertEquals(original.getIdToken(), loaded.getIdToken());
        assertEquals(original.getRefreshToken(), loaded.getRefreshToken());

        // Clear credentials
        store.clear();
        assertNull(store.loadSession());
        assertFalse(store.hasStoredCredential());
    }

    @Test
    public void testRejectSessionWithoutRefreshToken() throws Exception {
        java.io.File configDir = new java.io.File(System.getProperty("user.home"), ".takeoutfix");
        java.io.File sessionFile = new java.io.File(configDir, "session.json");
        configDir.mkdirs();

        // Simulate the bug: session.json with only email & displayName, NO tokens
        org.json.JSONObject badSession = new org.json.JSONObject();
        badSession.put("email", "fake@example.com");
        badSession.put("displayName", "Fake User");
        java.nio.file.Files.writeString(sessionFile.toPath(), badSession.toString());

        // Must reject session because no refreshToken exists
        assertFalse(store.hasStoredCredential());
        assertNull(store.loadSession());
    }
}
