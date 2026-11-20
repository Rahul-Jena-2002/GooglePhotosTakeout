package com.takeoutfix.auth;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

public class CredentialStoreTest {

    @TempDir
    Path tempDir;

    private CredentialStore store;

    @BeforeEach
    public void setup() {
        store = new CredentialStore(tempDir.toFile());
        store.clear();
    }

    @AfterEach
    public void tearDown() {
        if (store != null) {
            store.clear();
        }
    }

    @Test
    public void clearReportsMissingAccountIdentity() throws Exception {
        Path config = java.nio.file.Files.createDirectory(tempDir.resolve("missing-account"));
        java.nio.file.Files.writeString(config.resolve("session.json"), "{}");
        CredentialStore fake = new CredentialStore(config.toFile());
        assertFalse(fake.clear());
        assertFalse(java.nio.file.Files.exists(config.resolve("session.json")));
    }

    @Test
    public void clearReportsFailureAndContinuesOtherCleanup() throws Exception {
        Path config = java.nio.file.Files.createDirectory(tempDir.resolve("clear-failure"));
        Path metadata = java.nio.file.Files.createDirectory(config.resolve("session.json"));
        java.nio.file.Files.writeString(metadata.resolve("keep"), "keep");
        Path backup = config.resolve(".credentials.enc");
        java.nio.file.Files.writeString(backup, "backup");
        CredentialStore fake = new CredentialStore(config.toFile());
        assertFalse(fake.clear());
        assertFalse(java.nio.file.Files.exists(backup));
        assertTrue(java.nio.file.Files.exists(metadata.resolve("keep")));
    }

    @Test
    public void sessionFileReplacementDoesNotTruncateOnFailure() throws Exception {
        Path destination = java.nio.file.Files.createDirectory(tempDir.resolve("destination"));
        java.nio.file.Files.writeString(destination.resolve("keep.txt"), "keep");
        assertThrows(java.io.IOException.class, () -> CredentialStore.writeAtomically(destination, "replacement"));
        assertEquals("keep", java.nio.file.Files.readString(destination.resolve("keep.txt")));
        try (var files = java.nio.file.Files.list(tempDir)) {
            assertFalse(files.anyMatch(path -> path.getFileName().toString().startsWith(".takeoutfix-")));
        }
    }

    @Test
    public void sessionFileReplacementWritesNewContents() throws Exception {
        Path destination = tempDir.resolve("session.json");
        java.nio.file.Files.writeString(destination, "old");
        CredentialStore.writeAtomically(destination, "new");
        assertEquals("new", java.nio.file.Files.readString(destination));
    }

    @Test
    public void saveReportsMetadataWriteFailure() throws Exception {
        Path config = java.nio.file.Files.createDirectory(tempDir.resolve("write-failure"));
        Path metadata = java.nio.file.Files.createDirectory(config.resolve("session.json"));
        java.nio.file.Files.writeString(metadata.resolve("keep"), "keep");
        CredentialStore fake = new CredentialStore(config.toFile()) {
            @Override boolean saveToKeyring(String account, String serialized) { return true; }
        };
        AuthSession session = new AuthSession("uid", "test@example.invalid", "Test", "", "id", "refresh", "free", 1);
        assertThrows(IllegalStateException.class, () -> fake.saveSession(session));
    }

    @Test
    public void fallbackDoesNotRestoreStaleKeyringToken() throws Exception {
        Path config = java.nio.file.Files.createDirectory(tempDir.resolve("stale-keyring"));
        CredentialStore fake = new CredentialStore(config.toFile()) {
            @Override boolean saveToKeyring(String account, String serialized) { return false; }
            @Override org.json.JSONObject loadFromKeyring(String account) {
                return new org.json.JSONObject().put("refreshToken", "old-refresh").put("idToken", "old-id");
            }
        };
        fake.saveSession(new AuthSession("uid", "test@example.invalid", "Test", "", "new-id", "new-refresh", "free", 1));
        AuthSession restored = fake.loadSession();
        assertNotNull(restored);
        assertEquals("new-refresh", restored.getRefreshToken());
        assertEquals(CredentialStore.StorageTier.ENCRYPTED_VAULT_FALLBACK, fake.getStorageTier("test@example.invalid"));
    }

    @Test
    public void verifiedKeyringWriteRemovesLegacyBackup() throws Exception {
        Path config = java.nio.file.Files.createDirectory(tempDir.resolve("verified"));
        Path backup = config.resolve(".credentials.enc");
        java.nio.file.Files.writeString(backup, "old backup");
        CredentialStore fake = new CredentialStore(config.toFile()) {
            @Override boolean saveToKeyring(String account, String serialized) { return true; }
        };
        fake.saveSession(new AuthSession("uid", "test@example.invalid", "Test", "", "id", "refresh", "free", 1));
        assertFalse(java.nio.file.Files.exists(backup));
        assertFalse(java.nio.file.Files.readString(config.resolve("session.json")).contains("refresh"));
    }

    @Test
    public void unavailableKeyringStillUsesLegacyFallback() throws Exception {
        Path config = java.nio.file.Files.createDirectory(tempDir.resolve("fallback"));
        CredentialStore fake = new CredentialStore(config.toFile()) {
            @Override boolean saveToKeyring(String account, String serialized) { return false; }
        };
        fake.saveSession(new AuthSession("uid", "test@example.invalid", "Test", "", "id", "refresh", "free", 1));
        assertTrue(java.nio.file.Files.exists(config.resolve(".credentials.enc")));
    }

    @Test
    public void testSaveAndLoadSession() {
        AuthSession original = new AuthSession(
                "uid-test-456",
                "credential-test-" + java.util.UUID.randomUUID() + "@example.invalid",
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
        // Verify tokens are restored from the credential store.
        assertEquals(original.getIdToken(), loaded.getIdToken());
        assertEquals(original.getRefreshToken(), loaded.getRefreshToken());

        // Clear credentials
        store.clear();
        assertNull(store.loadSession());
        assertFalse(store.hasStoredCredential());
    }

    @Test
    public void testRejectSessionWithoutRefreshToken() throws Exception {
        java.io.File sessionFile = tempDir.resolve("session.json").toFile();

        // Simulate the bug: session.json with only email & displayName, NO tokens
        org.json.JSONObject badSession = new org.json.JSONObject();
        badSession.put("email", "missing-credential-" + java.util.UUID.randomUUID() + "@example.invalid");
        badSession.put("displayName", "Fake User");
        java.nio.file.Files.writeString(sessionFile.toPath(), badSession.toString());

        // Must reject session because no refreshToken exists
        assertFalse(store.hasStoredCredential());
        assertNull(store.loadSession());
    }
}
