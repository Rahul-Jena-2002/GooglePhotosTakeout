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

    public static final String FIREBASE_WEB_API_KEY = "AIzaSyDBTj1lcAbftiAYwnv5upjHK7ET_sNgZNk";
    private static final String FIREBASE_SIGNIN_IDP_ENDPOINT = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=" + FIREBASE_WEB_API_KEY;
    private static final String FIREBASE_LOOKUP_ENDPOINT = "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_WEB_API_KEY;
    private static final String FIREBASE_REFRESH_ENDPOINT = "https://securetoken.googleapis.com/v1/token?key=" + FIREBASE_WEB_API_KEY;
    private static final String FIRESTORE_USER_ENDPOINT = "https://firestore.googleapis.com/v1/projects/takeout-fix/databases/(default)/documents/users/";

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

        // Otherwise exchange raw Google ID token via Firebase signInWithIdp
        String googleIdToken = String.valueOf(callbackParams.getOrDefault("google_id_token", callbackParams.getOrDefault("id_token", "")));
        if (!googleIdToken.isBlank()) {
            try {
                JSONObject reqBody = new JSONObject();
                reqBody.put("postBody", "id_token=" + googleIdToken + "&providerId=google.com");
                reqBody.put("requestUri", "http://127.0.0.1/auth/callback");
                reqBody.put("returnSecureToken", true);
                reqBody.put("returnIdpCredential", true);

                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(FIREBASE_SIGNIN_IDP_ENDPOINT))
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

        throw new AuthException("Callback payload missing both Firebase ID token and Google ID token.");
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
                    .uri(URI.create(FIREBASE_REFRESH_ENDPOINT))
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
                    .uri(URI.create(FIREBASE_LOOKUP_ENDPOINT))
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
                    .uri(URI.create(FIRESTORE_USER_ENDPOINT + uid))
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
