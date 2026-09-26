package com.takeoutfix.auth;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;

@EnabledOnOs(OS.WINDOWS)
@DisplayName("Native Windows Credential Manager (DPAPI) Live Round-Trip Integration Test")
class NativeWindowsKeyringIntegrationTest {

    private static final String TEST_EMAIL = "native-keyring-test@takeoutfix.com";
    private CredentialStore credentialStore;

    @BeforeEach
    void setUp() {
        credentialStore = new CredentialStore();
        credentialStore.clear();
        deleteFromWindowsCredentialManager(TEST_EMAIL);
    }

    @AfterEach
    void tearDown() {
        if (credentialStore != null) {
            credentialStore.clear();
        }
        deleteFromWindowsCredentialManager(TEST_EMAIL);
    }

    @Test
    @DisplayName("Verify real DPAPI write, live cmdkey /list existence, and clean removal on clear()")
    void testLiveWindowsCredentialManagerPersistenceAndCleanup() {
        AuthSession testSession = new AuthSession(
                "uid-live-dpapi-999",
                TEST_EMAIL,
                "Native Test User",
                "https://photos.google.com/icon.png",
                "jwt-token-live-windows-dpapi",
                "refresh-token-live-windows-dpapi",
                "pro",
                System.currentTimeMillis() + 3600_000L
        );

        // 1. Save session using real CredentialStore -> Keyring.create() -> Windows Credential Manager
        credentialStore.saveSession(testSession);

        // 2. StorageTier must be OS_KEYRING on Windows
        assertEquals(CredentialStore.StorageTier.OS_KEYRING, credentialStore.getStorageTier(TEST_EMAIL),
                "Storage tier must be OS_KEYRING when Windows Credential Manager is operational");

        // 3. Inspect Windows Credential Manager directly via OS command (cmdkey /list)
        String cmdkeyOutput = runCmdkeyListing();
        assertTrue(cmdkeyOutput.contains("TakeoutFix|" + TEST_EMAIL),
                "Windows Credential Manager MUST contain 'TakeoutFix|" + TEST_EMAIL + "' in cmdkey /list output");

        // 4. Verify loading reads exact tokens from Windows Credential Manager (with small retry for Windows Credential Manager file IO)
        AuthSession loaded = null;
        for (int i = 0; i < 5; i++) {
            loaded = credentialStore.loadSession();
            if (loaded != null) break;
            try { Thread.sleep(50); } catch (InterruptedException ignored) {}
        }
        assertNotNull(loaded, "Session must be successfully loaded from OS Keyring");
        assertEquals("jwt-token-live-windows-dpapi", loaded.getIdToken());
        assertEquals("refresh-token-live-windows-dpapi", loaded.getRefreshToken());

        // 5. Clear credentials and assert clean deletion from Windows Credential Manager
        credentialStore.clear();

        String cmdkeyAfterClear = runCmdkeyListing();
        assertFalse(cmdkeyAfterClear.contains("TakeoutFix|" + TEST_EMAIL),
                "Credentials MUST be purged from Windows Credential Manager after clear()");
        assertEquals(CredentialStore.StorageTier.NONE, credentialStore.getStorageTier(TEST_EMAIL));
    }

    private String runCmdkeyListing() {
        try {
            Process process = new ProcessBuilder("cmdkey", "/list").redirectErrorStream(true).start();
            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line).append("\n");
                }
            }
            process.waitFor();
            return sb.toString();
        } catch (Exception e) {
            fail("Failed to execute cmdkey /list: " + e.getMessage());
            return "";
        }
    }

    private void deleteFromWindowsCredentialManager(String email) {
        try (com.github.javakeyring.Keyring keyring = com.github.javakeyring.Keyring.create()) {
            keyring.deletePassword("TakeoutFix", email);
        } catch (Exception ignored) {}

        try {
            Process process = new ProcessBuilder("cmdkey", "/delete:TakeoutFix|" + email).redirectErrorStream(true).start();
            process.waitFor();
        } catch (Exception ignored) {
            // Cleanup helper
        }
    }
}
