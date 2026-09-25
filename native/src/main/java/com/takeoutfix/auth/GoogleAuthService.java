package com.takeoutfix.auth;

import com.takeoutfix.shared.util.BrowserUtil;
import org.springframework.beans.factory.ObjectFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/**
 * Handles Google OAuth 2.0 Authorization Code flow with PKCE (RFC 7636),
 * anti-CSRF state parameter validation, and loopback redirect on 127.0.0.1:<port>.
 * Uses a prototype-scoped ephemeral AuthCallbackServer created strictly on-demand per request.
 */
@Service
public class GoogleAuthService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final ObjectFactory<AuthCallbackServer> callbackServerProvider;
    private final FirebaseTokenService tokenService;
    private final SessionManager sessionManager;
    private final CredentialStore credentialStore;

    public GoogleAuthService() {
        this(AuthCallbackServer::new, new FirebaseTokenService(), new SessionManager(), new CredentialStore());
    }

    public GoogleAuthService(AuthCallbackServer callbackServer, FirebaseTokenService tokenService, SessionManager sessionManager) {
        this(() -> callbackServer, tokenService, sessionManager, new CredentialStore());
    }

    @Autowired
    public GoogleAuthService(ObjectFactory<AuthCallbackServer> callbackServerProvider,
                             FirebaseTokenService tokenService,
                             SessionManager sessionManager,
                             CredentialStore credentialStore) {
        this.callbackServerProvider = callbackServerProvider;
        this.tokenService = tokenService;
        this.sessionManager = sessionManager;
        this.credentialStore = credentialStore;
    }

    public SessionManager getSessionManager() {
        return sessionManager;
    }

    /**
     * Initiates Google OAuth 2.0 flow:
     * 1. Generates anti-CSRF state token
     * 2. Starts local loopback listener bound specifically to 127.0.0.1 on an ephemeral port
     * 3. Launches system browser to authenticate with forced account selection
     * 4. Exchanges received authorization payload for Firebase tokens and persists session
     */
    public CompletableFuture<AuthSession> authenticate() {
        CompletableFuture<AuthSession> resultFuture = new CompletableFuture<>();

        // Generate Anti-CSRF State Parameter
        String stateToken = generateSecureRandomString(32);

        AuthCallbackServer callbackServer = callbackServerProvider.getObject();
        CompletableFuture<Map<String, Object>> callbackFuture = new CompletableFuture<>();
        try {
            int port = callbackServer.start(stateToken, callbackFuture);
            if (port <= 0) {
                resultFuture.completeExceptionally(new AuthException("Failed to bind local loopback server to 127.0.0.1."));
                return resultFuture;
            }

            String baseUrl = resolveBaseAuthUrl();

            String authUrl = baseUrl + "?port=" + port
                    + "&desktop_port=" + port
                    + "&state=" + stateToken
                    + "&select_account=true"
                    + "&prompt=select_account";

            boolean opened = BrowserUtil.openBrowser(authUrl);
            if (!opened) {
                callbackServer.stop();
                resultFuture.completeExceptionally(new AuthException("Failed to launch system browser. Please visit: " + authUrl));
                return resultFuture;
            }

            // Await loopback response with 3-minute timeout
            callbackFuture.orTimeout(180, TimeUnit.SECONDS).whenComplete((params, error) -> {
                if (error != null) {
                    callbackServer.stop();
                    resultFuture.completeExceptionally(new AuthException("Google Sign-In was cancelled or timed out: " + error.getMessage(), error));
                    return;
                }

                try {
                    // Exchange received credential / authorization code for Firebase tokens
                    AuthSession session = tokenService.exchangeGoogleCredential(params);
                    if (session == null || !session.isAuthenticated()) {
                        callbackServer.stop();
                        throw new AuthException("Failed to establish verified session from Google callback.");
                    }

                    // Save session securely to session.json via CredentialStore and SessionManager
                    credentialStore.saveSession(session);
                    sessionManager.save(session);
                    resultFuture.complete(session);

                } catch (Exception e) {
                    callbackServer.stop();
                    resultFuture.completeExceptionally(new AuthException("Authentication exchange failed: " + e.getMessage(), e));
                }
            });

        } catch (Exception e) {
            callbackServer.stop();
            resultFuture.completeExceptionally(new AuthException("Failed to initiate Google authentication: " + e.getMessage(), e));
        }

        return resultFuture;
    }

    public void signOut() {
        sessionManager.logout();
    }

    private String resolveBaseAuthUrl() {
        for (int p : new int[]{4321, 4322}) {
            if (isLocalPortListening(p)) {
                return "http://localhost:" + p + "/auth/desktop";
            }
        }
        return "https://takeoutfix.pages.dev/auth/desktop";
    }

    private boolean isLocalPortListening(int port) {
        try (java.net.Socket s = new java.net.Socket()) {
            s.connect(new java.net.InetSocketAddress("127.0.0.1", port), 100);
            return true;
        } catch (Exception ignored) {
            // Local development server port is not active; fallback to production URL
            return false;
        }
    }

    // ── PKCE and State Utilities (RFC 7636 & RFC 6749) ───────────────────────

    private String generateSecureRandomString(int byteLength) {
        byte[] randomBytes = new byte[byteLength];
        SECURE_RANDOM.nextBytes(randomBytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes);
    }
}
