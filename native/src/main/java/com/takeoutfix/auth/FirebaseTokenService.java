package com.takeoutfix.auth;

import org.json.JSONObject;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

import org.springframework.stereotype.Service;

/**
 * Handles Firebase Authentication REST API integration:
 * - Exchanges Google OAuth credentials for Firebase ID token and Refresh token
 * - Refreshes expired Firebase ID tokens
 * - Verifies ID tokens against Firebase Identity Toolkit and validates revocation
 * - Fetches user plan and profile from Cloud Firestore
 */
@Service
public class FirebaseTokenService {

    public static String getFirebaseApiKey() {
        return FirebaseConfig.getApiKey();
    }

    private static String getSigninIdpEndpoint() {
        return "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=" + FirebaseConfig.getApiKey();
    }

    private static String getLookupEndpoint() {
        return "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FirebaseConfig.getApiKey();
    }

    private static String getRefreshEndpoint() {
        return "https://securetoken.googleapis.com/v1/token?key=" + FirebaseConfig.getApiKey();
    }

    private static String getFirestoreUserEndpoint() {
        return "https://firestore.googleapis.com/v1/projects/" + FirebaseConfig.getProjectId() + "/databases/(default)/documents/users/";
    }

    private final HttpClient httpClient;

    public FirebaseTokenService() {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    /**
     * Exchanges Google OAuth credentials / authorization code with Firebase Authentication.
     */
    public AuthSession exchangeGoogleCredential(Map<String, Object> callbackParams) throws AuthException {
        if (callbackParams == null || callbackParams.isEmpty()) {
            throw new AuthException("No authentication parameters received from Google callback.");
        }

        // If the callback already contains Firebase tokens (from TakeoutFix Webapp Google OAuth bridge)
        String idToken = String.valueOf(callbackParams.getOrDefault("idToken", callbackParams.getOrDefault("token", "")));
        String refreshToken = String.valueOf(callbackParams.getOrDefault("refreshToken", ""));
        String uid = String.valueOf(callbackParams.getOrDefault("uid", callbackParams.getOrDefault("googleId", "")));

        if (!idToken.isBlank() && !uid.isBlank()) {
            String email = String.valueOf(callbackParams.getOrDefault("email", ""));
            String displayName = String.valueOf(callbackParams.getOrDefault("displayName", email.contains("@") ? email.split("@")[0] : "User"));
            String photoUrl = String.valueOf(callbackParams.getOrDefault("photoURL", callbackParams.getOrDefault("photoUrl", "")));
            String plan = String.valueOf(callbackParams.getOrDefault("plan", "free"));
            long expiresAt = System.currentTimeMillis() + 3600_000L;

            return new AuthSession(uid, email, displayName, photoUrl, idToken, refreshToken, plan, expiresAt);
        }

        // If an OAuth authorization code was received directly from accounts.google.com
        String code = String.valueOf(callbackParams.getOrDefault("code", ""));
        String googleIdToken = String.valueOf(callbackParams.getOrDefault("google_id_token", callbackParams.getOrDefault("id_token", "")));

        if (googleIdToken.isBlank() && !code.isBlank()) {
            try {
                String clientId = FirebaseConfig.getGoogleClientId();
                String clientSecret = FirebaseConfig.getGoogleClientSecret();
                String redirectUri = String.valueOf(callbackParams.getOrDefault("redirect_uri", "http://127.0.0.1/auth/callback"));
                String codeVerifier = String.valueOf(callbackParams.getOrDefault("code_verifier", ""));

                StringBuilder form = new StringBuilder();
                form.append("code=").append(java.net.URLEncoder.encode(code, StandardCharsets.UTF_8));
                form.append("&client_id=").append(java.net.URLEncoder.encode(clientId, StandardCharsets.UTF_8));
                if (clientSecret != null && !clientSecret.isBlank()) {
                    form.append("&client_secret=").append(java.net.URLEncoder.encode(clientSecret, StandardCharsets.UTF_8));
                }
                form.append("&redirect_uri=").append(java.net.URLEncoder.encode(redirectUri, StandardCharsets.UTF_8));
                form.append("&grant_type=authorization_code");
                if (!codeVerifier.isBlank()) {
                    form.append("&code_verifier=").append(java.net.URLEncoder.encode(codeVerifier, StandardCharsets.UTF_8));
                }

                HttpRequest tokenRequest = HttpRequest.newBuilder()
                        .uri(URI.create("https://oauth2.googleapis.com/token"))
                        .timeout(Duration.ofSeconds(12))
                        .header("Content-Type", "application/x-www-form-urlencoded")
                        .header("Accept", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(form.toString(), StandardCharsets.UTF_8))
                        .build();

                HttpResponse<String> tokenResponse = httpClient.send(tokenRequest, HttpResponse.BodyHandlers.ofString());
                if (tokenResponse.statusCode() != 200) {
                    throw new AuthException("Google token exchange failed (HTTP " + tokenResponse.statusCode() + "): " + tokenResponse.body());
                }

                JSONObject tokenJson = new JSONObject(tokenResponse.body());
                googleIdToken = tokenJson.optString("id_token", "");
                if (googleIdToken.isBlank()) {
                    throw new AuthException("Google token response did not contain an id_token.");
                }
            } catch (AuthException ae) {
                throw ae;
            } catch (Exception e) {
                throw new AuthException("Failed to exchange authorization code with Google: " + e.getMessage(), e);
            }
        }

        // Exchange raw Google ID token via Firebase signInWithIdp
        if (!googleIdToken.isBlank()) {
            try {
                JSONObject reqBody = new JSONObject();
                reqBody.put("postBody", "id_token=" + googleIdToken + "&providerId=google.com");
                reqBody.put("requestUri", "http://127.0.0.1/auth/callback");
                reqBody.put("returnSecureToken", true);
                reqBody.put("returnIdpCredential", true);

                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(getSigninIdpEndpoint()))
                        .timeout(Duration.ofSeconds(12))
                        .header("Content-Type", "application/json")
                        .header("Accept", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(reqBody.toString(), StandardCharsets.UTF_8))
                        .build();

                HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() != 200) {
                    throw new AuthException("Firebase IDP exchange failed (HTTP " + response.statusCode() + "): " + response.body());
                }

                JSONObject res = new JSONObject(response.body());
                String firebaseIdToken = res.optString("idToken", "");
                String firebaseRefreshToken = res.optString("refreshToken", "");
                String firebaseUid = res.optString("localId", "");
                String email = res.optString("email", "");
                String displayName = res.optString("displayName", email.split("@")[0]);
                String photoUrl = res.optString("photoUrl", "");
                long expiresIn = res.optLong("expiresIn", 3600L);
                long expiresAt = System.currentTimeMillis() + (expiresIn * 1000L);

                String plan = fetchPlanFromFirestore(firebaseUid, firebaseIdToken);
                return new AuthSession(firebaseUid, email, displayName, photoUrl, firebaseIdToken, firebaseRefreshToken, plan, expiresAt);
            } catch (AuthException ae) {
                throw ae;
            } catch (Exception e) {
                throw new AuthException("Failed to exchange Google OAuth credential with Firebase: " + e.getMessage(), e);
            }
        }

        throw new AuthException("Callback payload missing Firebase ID token, Google authorization code, or Google ID token.");
    }

    /**
     * Silent startup restoration (STEP 4):
     * Hits ONLY https://securetoken.googleapis.com/v1/token?key={API_KEY}
     * Exchanges stored refresh token for a fresh ID token in RAM.
     * Never opens a browser.
     */
    public AuthSession refreshAndVerify(AuthSession session) throws AuthException {
        if (session == null || !session.isAuthenticated()) {
            throw new AuthException("No active session to verify.");
        }

        String refreshToken = session.getRefreshToken();
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new AuthException("No refresh token available to renew session.");
        }

        return refreshIdToken(session);
    }

    /**
     * Calls Firebase Secure Token endpoint to exchange a refresh token for a fresh ID token.
     */
    public AuthSession refreshIdToken(AuthSession session) throws AuthException {
        if (session == null || session.getRefreshToken().isBlank()) {
            throw new AuthException("No refresh token available to renew session.");
        }

        try {
            String formBody = "grant_type=refresh_token&refresh_token=" + session.getRefreshToken();
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(getRefreshEndpoint()))
                    .timeout(Duration.ofSeconds(12))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(formBody, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                throw new AuthException("Firebase refresh token rejected (HTTP " + response.statusCode() + "): " + response.body());
            }

            JSONObject res = new JSONObject(response.body());
            String newIdToken = res.optString("id_token", "");
            String newRefreshToken = res.optString("refresh_token", session.getRefreshToken());
            long expiresIn = res.optLong("expires_in", 3600L);
            long newExpiresAt = System.currentTimeMillis() + (expiresIn * 1000L);
            String uid = res.optString("user_id", session.getUid());

            String plan = fetchPlanFromFirestore(uid, newIdToken);
            return session.withNewTokens(newIdToken, newRefreshToken, newExpiresAt, plan);
        } catch (AuthException ae) {
            throw ae;
        } catch (Exception e) {
            throw new AuthException("Failed to renew Firebase ID token: " + e.getMessage(), e);
        }
    }

    /**
     * Verifies the ID token with Firebase accounts:lookup.
     * Enforces that the account is active, exists, and not disabled/revoked.
     */
    public JSONObject verifyIdTokenAndRevocation(String idToken) throws AuthException {
        if (idToken == null || idToken.isBlank()) {
            throw new AuthException("ID token cannot be null or empty.");
        }

        try {
            JSONObject reqBody = new JSONObject();
            reqBody.put("idToken", idToken);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(getLookupEndpoint()))
                    .timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(reqBody.toString(), StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                throw new AuthException("ID token verification rejected by Firebase (HTTP " + response.statusCode() + ")");
            }

            JSONObject res = new JSONObject(response.body());
            if (!res.has("users") || res.getJSONArray("users").isEmpty()) {
                throw new AuthException("No user record found for this token.");
            }

            JSONObject user = res.getJSONArray("users").getJSONObject(0);

            // Check if user was disabled
            if (user.optBoolean("disabled", false)) {
                throw new AuthException("This user account has been disabled.");
            }

            return user;
        } catch (AuthException ae) {
            throw ae;
        } catch (Exception e) {
            throw new AuthException("Failed to verify token revocation: " + e.getMessage(), e);
        }
    }

    /**
     * Fetches user tier/plan from Cloud Firestore.
     */
    public String fetchPlanFromFirestore(String uid, String idToken) {
        if (uid == null || uid.isBlank()) return "free";

        try {
            HttpRequest.Builder reqBuilder = HttpRequest.newBuilder()
                    .uri(URI.create(getFirestoreUserEndpoint() + uid))
                    .timeout(Duration.ofSeconds(6))
                    .header("Accept", "application/json")
                    .GET();

            if (idToken != null && !idToken.isBlank()) {
                reqBuilder.header("Authorization", "Bearer " + idToken);
            }

            HttpResponse<String> response = httpClient.send(reqBuilder.build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200) {
                JSONObject doc = new JSONObject(response.body());
                if (doc.has("fields")) {
                    JSONObject fields = doc.getJSONObject("fields");
                    if (fields.has("plan") && fields.getJSONObject("plan").has("stringValue")) {
                        return fields.getJSONObject("plan").getString("stringValue");
                    }
                }
            }
        } catch (Exception e) {
            System.err.println("[FirebaseTokenService] Firestore plan lookup notice: " + e.getMessage());
        }
        return "free";
    }
}
