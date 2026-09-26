package com.takeoutfix.auth;

import com.takeoutfix.shared.util.BrowserUtil;
import org.springframework.beans.factory.ObjectFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
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
     * 1. Generates anti-CSRF state token and PKCE code challenge
     * 2. Starts local loopback listener bound specifically to 127.0.0.1 on an ephemeral port
     * 3. Launches system browser directly to accounts.google.com
     * 4. Exchanges received authorization code for tokens and persists session
     */
    public CompletableFuture<AuthSession> authenticate() {
        CompletableFuture<AuthSession> resultFuture = new CompletableFuture<>();

        // Generate Anti-CSRF State Parameter & PKCE Verifier
        String stateToken = generateSecureRandomString(32);
        String codeVerifier = generateSecureRandomString(64);
        String codeChallenge = generateCodeChallenge(codeVerifier);

        AuthCallbackServer callbackServer = callbackServerProvider.getObject();
        CompletableFuture<Map<String, Object>> callbackFuture = new CompletableFuture<>();
        try {
            int port = callbackServer.start(stateToken, callbackFuture);
            if (port <= 0) {
                resultFuture.completeExceptionally(new AuthException("Failed to bind local loopback server to 127.0.0.1."));
                return resultFuture;
            }

            String redirectUri = "http://127.0.0.1:" + port + "/auth/callback";
            String clientId = FirebaseConfig.getGoogleClientId();

            String authUrl;
            if (clientId != null && !clientId.isBlank()) {
                // Direct RFC 8252 + RFC 7636 OAuth 2.0 directly to accounts.google.com
                authUrl = "https://accounts.google.com/o/oauth2/v2/auth?"
                        + "client_id=" + URLEncoder.encode(clientId, StandardCharsets.UTF_8)
                        + "&response_type=code"
                        + "&scope=" + URLEncoder.encode("openid profile email", StandardCharsets.UTF_8)
                        + "&redirect_uri=" + URLEncoder.encode(redirectUri, StandardCharsets.UTF_8)
                        + "&state=" + URLEncoder.encode(stateToken, StandardCharsets.UTF_8)
                        + "&code_challenge=" + URLEncoder.encode(codeChallenge, StandardCharsets.UTF_8)
                        + "&code_challenge_method=S256"
                        + "&prompt=select_account";
            } else {
                // Fallback to webapp bridge
                String baseUrl = resolveBaseAuthUrl();
                authUrl = baseUrl + "?port=" + port
                        + "&desktop_port=" + port
                        + "&state=" + stateToken
                        + "&select_account=true"
                        + "&prompt=select_account";
            }

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
                    // Inject PKCE verifier and redirectUri for the token exchange
                    params.put("code_verifier", codeVerifier);
                    params.put("redirect_uri", redirectUri);

                    // Exchange received credential / authorization code for Firebase tokens
                    AuthSession session = tokenService.exchangeGoogleCredential(params);
                    if (session == null || !session.isAuthenticated()) {
                        callbackServer.stop();
                        throw new AuthException("Failed to establish verified session from Google callback.");
                    }

                    // Save session securely to session.json via CredentialStore and SessionManager
                    credentialStore.saveSession(session);
                    sessionManager.save(session);

                    // Auto-focus TakeoutFix Desktop window so user transitions seamlessly
                    javax.swing.SwingUtilities.invokeLater(() -> {
                        for (java.awt.Window win : java.awt.Window.getWindows()) {
                            if (win instanceof javax.swing.JFrame frame && frame.isVisible()) {
                                frame.setState(java.awt.Frame.NORMAL);
                                frame.toFront();
                                frame.requestFocus();
                                try {
                                    frame.setAlwaysOnTop(true);
                                    frame.setAlwaysOnTop(false);
                                } catch (Exception ignored) {}
                            }
                        }
                    });

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
        for (String host : new String[]{"localhost", "127.0.0.1"}) {
            try (java.net.Socket s = new java.net.Socket()) {
                s.connect(new java.net.InetSocketAddress(host, port), 250);
                return true;
            } catch (Exception ignored) {
                // Try next host candidate
            }
        }
        return false;
    }

    // ── PKCE and State Utilities (RFC 7636 & RFC 6749) ───────────────────────

    private String generateSecureRandomString(int byteLength) {
        byte[] randomBytes = new byte[byteLength];
        SECURE_RANDOM.nextBytes(randomBytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes);
    }

    private String generateCodeChallenge(String codeVerifier) {
        try {
            byte[] bytes = codeVerifier.getBytes(StandardCharsets.US_ASCII);
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(bytes);
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available for PKCE", e);
        }
    }
}
