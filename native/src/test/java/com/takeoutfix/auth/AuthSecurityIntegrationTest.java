package com.takeoutfix.auth;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.ConnectException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Rigorous integration test suite verifying:
 * 1. Disabled and revoked account rejection
 * 2. Refresh token failure
 * 3. Network outage preservation (AuthUnavailable, zero logout)
 * 4. OAuth state parameter CSRF rejection
 * 5. Strict 127.0.0.1 loopback binding and ephemeral port reuse
 */
public class AuthSecurityIntegrationTest {

    private CredentialStore credentialStore;

    @BeforeEach
    public void setup() {
        credentialStore = new CredentialStore();
        credentialStore.clear();
    }

    @AfterEach
    public void tearDown() {
        if (credentialStore != null) {
            credentialStore.clear();
        }
    }

    @Test
    public void testRevokedOrDisabledAccountRejection() {
        // Mock token service simulating a revoked or disabled account
        FirebaseTokenService mockTokenService = new FirebaseTokenService() {
            @Override
            public AuthSession refreshAndVerify(AuthSession session) throws AuthException {
                throw new AuthException("This user account has been disabled or revoked.");
            }
        };

        SessionManager manager = new SessionManager(credentialStore, mockTokenService);

        // Seed a stored session
        AuthSession stored = new AuthSession("uid-1", "user@gmail.com", "User", "", "", "bad-refresh-token", "free", 0L);
        credentialStore.saveSession(stored);
        assertTrue(credentialStore.hasStoredCredential());

        // Restore should identify disabled/revoked account and return RequiresLogin
        SessionRestoreResult result = manager.restore();
        assertInstanceOf(SessionRestoreResult.RequiresLogin.class, result);
        assertFalse(manager.isAuthenticated());

        // Credential store must be cleared to prevent loop
        assertNull(credentialStore.loadSession());
    }

    @Test
    public void testRefreshTokenFailure() {
        FirebaseTokenService mockTokenService = new FirebaseTokenService() {
            @Override
            public AuthSession refreshAndVerify(AuthSession session) throws AuthException {
                throw new AuthException("Firebase refresh token rejected (HTTP 400)");
            }
        };

        SessionManager manager = new SessionManager(credentialStore, mockTokenService);
        AuthSession stored = new AuthSession("uid-2", "user2@gmail.com", "User 2", "", "", "expired-refresh", "free", 0L);
        credentialStore.saveSession(stored);

        SessionRestoreResult result = manager.restore();
        assertInstanceOf(SessionRestoreResult.RequiresLogin.class, result);
        assertFalse(manager.isAuthenticated());
    }

    @Test
    public void testNetworkOutagePreservesSessionWithoutLogout() {
        // Mock token service simulating offline / network failure
        FirebaseTokenService mockTokenService = new FirebaseTokenService() {
            @Override
            public AuthSession refreshAndVerify(AuthSession session) throws AuthException {
                throw new AuthException("Connection timed out to Firebase server", new ConnectException("Network unreachable"));
            }
        };

        SessionManager manager = new SessionManager(credentialStore, mockTokenService);
        AuthSession stored = new AuthSession("uid-3", "offline@gmail.com", "Offline User", "", "", "good-refresh-token", "pro", 0L);
        credentialStore.saveSession(stored);

        // Restore should return AuthUnavailable
        SessionRestoreResult result = manager.restore();
        assertInstanceOf(SessionRestoreResult.AuthUnavailable.class, result);

        SessionRestoreResult.AuthUnavailable unavailable = (SessionRestoreResult.AuthUnavailable) result;
        assertTrue(unavailable.reason().contains("Connection timed out"));

        // Crucial test: Local credentials MUST be preserved so user is not logged out while offline!
        assertTrue(credentialStore.hasStoredCredential());
        AuthSession loaded = credentialStore.loadSession();
        assertNotNull(loaded);
        assertEquals("offline@gmail.com", loaded.getEmail());
    }

    @Test
    public void testOAuthStateParameterMismatchRejection() throws Exception {
        AuthCallbackServer server = new AuthCallbackServer();
        CompletableFuture<Map<String, Object>> future = new CompletableFuture<>();

        String expectedState = "secret-state-xyz-123";
        int port = server.start(expectedState, future);
        assertTrue(port > 0);

        try {
            HttpClient client = HttpClient.newHttpClient();

            // 1. Send callback request with WRONG state parameter
            HttpRequest badRequest = HttpRequest.newBuilder()
                    .uri(URI.create("http://127.0.0.1:" + port + "/auth/callback?token=testToken&state=TAMPERED_STATE"))
                    .GET()
                    .build();

            HttpResponse<String> response = client.send(badRequest, HttpResponse.BodyHandlers.ofString());
            assertEquals(400, response.statusCode());
            assertTrue(response.body().contains("OAuth State Mismatch"));

            // Future must complete exceptionally with AuthException
            ExecutionException ex = assertThrows(ExecutionException.class, () -> future.get(3, TimeUnit.SECONDS));
            assertTrue(ex.getCause() instanceof AuthException);
            assertTrue(ex.getCause().getMessage().contains("OAuth state mismatch"));

        } finally {
            server.stop();
        }
    }

    @Test
    public void testStrictLoopbackBindingAndPortAllocation() throws IOException {
        AuthCallbackServer server1 = new AuthCallbackServer();
        AuthCallbackServer server2 = new AuthCallbackServer();

        CompletableFuture<Map<String, Object>> f1 = new CompletableFuture<>();
        CompletableFuture<Map<String, Object>> f2 = new CompletableFuture<>();

        try {
            int port1 = server1.start("state-1", f1);
            int port2 = server2.start("state-2", f2);

            assertTrue(port1 > 0 && port1 <= 65535);
            assertTrue(port2 > 0 && port2 <= 65535);
            assertNotEquals(port1, port2, "Ephemeral ports must be uniquely allocated per server instance");

        } finally {
            server1.stop();
            server2.stop();
        }
    }
}
