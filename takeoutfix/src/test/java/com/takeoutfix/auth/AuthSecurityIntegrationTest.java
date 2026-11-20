package com.takeoutfix.auth;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.json.JSONObject;

import java.io.IOException;
import java.net.ConnectException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
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

    @Test
    void manualSignInRejectsProfileWithoutIdToken() {
        assertThrows(IllegalArgumentException.class, () ->
                com.takeoutfix.network.DirectAuthHttpsService.parseAndAuthenticate(
                        "{\"uid\":\"someone\",\"email\":\"person@example.invalid\",\"refreshToken\":\"unverified\"}"));
        assertThrows(IllegalArgumentException.class, () ->
                com.takeoutfix.network.DirectAuthHttpsService.parseAndAuthenticate(
                        "uid=someone&email=person%40example.invalid"));
    }

    @TempDir
    Path tempDir;

    private CredentialStore credentialStore;
    private String testEmail;

    @BeforeEach
    public void setup() {
        credentialStore = new CredentialStore(tempDir.toFile());
        testEmail = "auth-test-" + java.util.UUID.randomUUID() + "@example.invalid";
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
        AuthSession stored = new AuthSession("uid-1", testEmail, "User", "", "", "bad-refresh-token", "free", 0L);
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
        AuthSession stored = new AuthSession("uid-2", testEmail, "User 2", "", "", "expired-refresh", "free", 0L);
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
        AuthSession stored = new AuthSession("uid-3", testEmail, "Offline User", "", "", "good-refresh-token", "pro", 0L);
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
        assertEquals(testEmail, loaded.getEmail());
    }

    @Test
    public void testDesktopBridgeUsesTrustedOrigin() {
        assertEquals("https://takeoutfix.pages.dev/login", GoogleAuthService.resolveBaseAuthUrl());
    }

    @Test
    void callbackRequiresStateAndFutureBeforeStarting() {
        AuthCallbackServer server = new AuthCallbackServer();
        assertThrows(IllegalArgumentException.class, () -> server.start("", new CompletableFuture<>()));
        assertThrows(IllegalArgumentException.class, () -> server.start(null, new CompletableFuture<>()));
        assertThrows(IllegalArgumentException.class, () -> server.start("state", null));
        assertEquals(0, server.getPort());
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

            assertFalse(future.isDone());
            HttpRequest validRequest = HttpRequest.newBuilder()
                    .uri(URI.create("http://127.0.0.1:" + port + "/auth/callback?code=valid&state=" + expectedState))
                    .GET().build();
            assertEquals(200, client.send(validRequest, HttpResponse.BodyHandlers.ofString()).statusCode());
            assertEquals("valid", future.get(3, TimeUnit.SECONDS).get("code"));

        } finally {
            server.stop();
        }
    }

    @Test
    public void testBridgeIdentityComesFromFirebaseLookup() throws Exception {
        FirebaseTokenService service = new FirebaseTokenService() {
            @Override
            public JSONObject lookupAccountByIdToken(String idToken) {
                return new JSONObject().put("localId", "verified-uid").put("email", "real@example.com")
                        .put("displayName", "Real User");
            }

            @Override
            public String fetchPlanFromFirestore(String uid, String idToken) {
                return "free";
            }
        };
        AuthSession session = service.exchangeGoogleCredential(Map.of(
                "idToken", "test-token", "uid", "verified-uid", "email", "fake@example.com", "plan", "pro"));
        assertEquals("real@example.com", session.getEmail());
        assertEquals("free", session.getPlan());
        assertThrows(AuthException.class, () -> service.exchangeGoogleCredential(Map.of(
                "idToken", "test-token", "uid", "other-uid")));
        FirebaseTokenService unavailable = new FirebaseTokenService() {
            @Override
            public JSONObject lookupAccountByIdToken(String idToken) throws AuthException {
                throw new AuthException("Firebase unavailable");
            }
        };
        assertThrows(AuthException.class, () -> unavailable.exchangeGoogleCredential(Map.of(
                "idToken", "test-token", "uid", "verified-uid")));
    }

    @Test
    public void testOAuthMissingStateIsRejectedEvenWithToken() throws Exception {
        AuthCallbackServer server = new AuthCallbackServer();
        CompletableFuture<Map<String, Object>> future = new CompletableFuture<>();
        int port = server.start("expected-state", future);
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("http://127.0.0.1:" + port + "/auth/callback?token=testToken"))
                    .GET().build();
            HttpResponse<String> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
            assertEquals(400, response.statusCode());
            assertFalse(future.isDone());
        } finally {
            server.stop();
        }
    }

    @Test
    public void testCallbackCorsAllowsOnlyTrustedWebOrigin() throws Exception {
        AuthCallbackServer server = new AuthCallbackServer();
        CompletableFuture<Map<String, Object>> future = new CompletableFuture<>();
        int port = server.start("expected-state", future);
        try {
            URI uri = URI.create("http://127.0.0.1:" + port + "/callback");
            HttpClient client = HttpClient.newHttpClient();
            HttpResponse<String> rejected = client.send(HttpRequest.newBuilder(uri)
                    .header("Origin", "https://untrusted.example")
                    .method("OPTIONS", HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
            assertEquals(403, rejected.statusCode());
            HttpResponse<String> allowed = client.send(HttpRequest.newBuilder(uri)
                    .header("Origin", "https://takeoutfix.pages.dev")
                    .method("OPTIONS", HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
            assertEquals(204, allowed.statusCode());
            assertEquals("https://takeoutfix.pages.dev", allowed.headers().firstValue("Access-Control-Allow-Origin").orElse(""));
            assertFalse(future.isDone());
        } finally {
            server.stop();
        }
    }

    @Test
    public void testSyncPersistsRefreshedTokensOnlyForStoredAccount() {
        AuthSession stored = new AuthSession("uid-1", "user@example.com", "User", "", "old-id", "old-refresh", "free", 0);
        AuthSession[] saved = { null };
        CredentialStore store = new CredentialStore(tempDir.toFile()) {
            @Override
            public synchronized AuthSession loadSession() { return stored; }

            @Override
            public synchronized void saveSession(AuthSession session) { saved[0] = session; }
        };

        FirebaseSyncService.saveTokensToSession(store, "new-id", "new-refresh", "other-uid");
        assertNull(saved[0]);
        FirebaseSyncService.saveTokensToSession(store, "new-id", "new-refresh", "uid-1");
        assertNotNull(saved[0]);
        assertEquals("new-id", saved[0].getIdToken());
        assertEquals("new-refresh", saved[0].getRefreshToken());
        assertEquals("uid-1", saved[0].getUid());
    }

    @Test
    public void testCallbackRejectsOversizedBodyAndUnsupportedMethod() throws Exception {
        AuthCallbackServer server = new AuthCallbackServer();
        CompletableFuture<Map<String, Object>> future = new CompletableFuture<>();
        int port = server.start("expected-state", future);
        try {
            URI uri = URI.create("http://127.0.0.1:" + port + "/callback");
            HttpClient client = HttpClient.newHttpClient();
            HttpResponse<String> oversized = client.send(HttpRequest.newBuilder(uri)
                    .POST(HttpRequest.BodyPublishers.ofString("x".repeat(65537))).build(), HttpResponse.BodyHandlers.ofString());
            assertEquals(413, oversized.statusCode());
            assertEquals("no-store", oversized.headers().firstValue("Cache-Control").orElse(""));
            assertEquals("no-referrer", oversized.headers().firstValue("Referrer-Policy").orElse(""));
            HttpResponse<String> unsupported = client.send(HttpRequest.newBuilder(uri)
                    .method("PUT", HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
            assertEquals(405, unsupported.statusCode());
            assertFalse(future.isDone());
        } finally {
            server.stop();
        }
    }

    @Test
    public void testCallbackResponseDoesNotWaitForFutureListeners() throws Exception {
        AuthCallbackServer server = new AuthCallbackServer();
        CompletableFuture<Map<String, Object>> future = new CompletableFuture<>();
        java.util.concurrent.CountDownLatch release = new java.util.concurrent.CountDownLatch(1);
        future.thenRun(() -> {
            try {
                release.await(3, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        int port = server.start("expected-state", future);
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("http://127.0.0.1:" + port + "/callback?state=expected-state&code=test"))
                    .timeout(java.time.Duration.ofSeconds(2)).GET().build();
            assertEquals(200, HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString()).statusCode());
        } finally {
            release.countDown();
            server.stop();
        }
        assertEquals("test", future.get(3, TimeUnit.SECONDS).get("code"));
    }

    @Test
    public void testCallbackAcceptsValidStateAndDeliversPayload() throws Exception {
        AuthCallbackServer server = new AuthCallbackServer();
        CompletableFuture<Map<String, Object>> future = new CompletableFuture<>();
        int port = server.start("expected-state", future);
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("http://127.0.0.1:" + port + "/callback"))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString("{\"state\":\"expected-state\",\"idToken\":\"test-token\"}"))
                    .build();
            HttpResponse<String> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
            assertEquals(200, response.statusCode());
            assertEquals("test-token", future.get(3, TimeUnit.SECONDS).get("idToken"));
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
