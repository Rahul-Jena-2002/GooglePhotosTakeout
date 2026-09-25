package com.takeoutfix.network;

import org.json.JSONObject;

import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

/**
 * Direct HTTPS Authentication & Token Verification Service.
 * Allows calling Firebase Auth & Firestore REST APIs directly over secure HTTPS
 * without requiring a browser redirect loop.
 */
public class DirectAuthHttpsService {

    public static final String FIREBASE_WEB_API_KEY = "AIzaSyDBTj1lcAbftiAYwnv5upjHK7ET_sNgZNk";
    private static final String FIREBASE_SIGNIN_ENDPOINT = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + FIREBASE_WEB_API_KEY;
    private static final String FIREBASE_SIGNUP_ENDPOINT = "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" + FIREBASE_WEB_API_KEY;
    private static final String FIREBASE_RESET_ENDPOINT = "https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=" + FIREBASE_WEB_API_KEY;
    private static final String FIREBASE_LOOKUP_ENDPOINT = "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_WEB_API_KEY;
    private static final String FIRESTORE_USER_ENDPOINT = "https://firestore.googleapis.com/v1/projects/takeout-fix/databases/(default)/documents/users/";

    private static final HttpClient HTTP_CLIENT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    /**
     * Authenticates with Email and Password directly via Firebase IdentityToolkit REST HTTPS API.
     */
    public static Map<String, Object> signInWithEmailPassword(String email, String password) throws Exception {
        if (email == null || email.trim().isEmpty() || password == null || password.trim().isEmpty()) {
            throw new IllegalArgumentException("Email and password cannot be empty.");
        }

        JSONObject req = new JSONObject();
        req.put("email", email.trim().toLowerCase());
        req.put("password", password);
        req.put("returnSecureToken", true);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(FIREBASE_SIGNIN_ENDPOINT))
                .timeout(Duration.ofSeconds(12))
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(req.toString(), StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
        JSONObject res = new JSONObject(response.body());

        if (response.statusCode() != 200) {
            String errorMsg = "Authentication failed.";
            if (res.has("error") && res.getJSONObject("error").has("message")) {
                String code = res.getJSONObject("error").getString("message");
                if (code.contains("EMAIL_NOT_FOUND") || code.contains("INVALID_LOGIN_CREDENTIALS")) {
                    errorMsg = "No account found or invalid credentials.";
                } else if (code.contains("INVALID_PASSWORD")) {
                    errorMsg = "Incorrect password. Please try again.";
                } else if (code.contains("USER_DISABLED")) {
                    errorMsg = "This user account has been disabled.";
                } else if (code.contains("TOO_MANY_ATTEMPTS_TRY_LATER")) {
                    errorMsg = "Too many failed attempts. Please try again later.";
                } else {
                    errorMsg = code;
                }
            }
            throw new IllegalArgumentException(errorMsg);
        }

        Map<String, Object> profile = new HashMap<>();
        String idToken = res.optString("idToken", "");
        String refreshToken = res.optString("refreshToken", "");
        profile.put("uid", res.optString("localId", ""));
        profile.put("googleId", res.optString("localId", ""));
        profile.put("email", res.optString("email", email.trim().toLowerCase()));
        profile.put("displayName", res.optString("displayName", email.split("@")[0]));
        profile.put("token", idToken);
        profile.put("idToken", idToken);
        profile.put("refreshToken", refreshToken);
        profile.put("plan", "free");

        enrichFromFirestoreIfPresent(profile);
        return profile;
    }

    /**
     * Authenticates with Email & Password directly from Java (STEP 2).
     * Returns a fully populated AuthSession with idToken and refreshToken.
     * Never opens a browser window or loopback server.
     */
    public static com.takeoutfix.auth.AuthSession authenticateWithEmailPassword(String email, String password) throws Exception {
        Map<String, Object> profile = signInWithEmailPassword(email, password);
        String uid = String.valueOf(profile.getOrDefault("uid", ""));
        String cleanEmail = String.valueOf(profile.getOrDefault("email", email != null ? email.trim().toLowerCase() : ""));
        String displayName = String.valueOf(profile.getOrDefault("displayName", cleanEmail.split("@")[0]));
        String idToken = String.valueOf(profile.getOrDefault("idToken", ""));
        String refreshToken = String.valueOf(profile.getOrDefault("refreshToken", ""));
        String plan = String.valueOf(profile.getOrDefault("plan", "free"));
        long expiresAt = System.currentTimeMillis() + 3600_000L;

        return new com.takeoutfix.auth.AuthSession(uid, cleanEmail, displayName, "", idToken, refreshToken, plan, expiresAt);
    }

    /**
     * Creates an account with Email and Password directly via Firebase IdentityToolkit REST HTTPS API.
     */
    public static Map<String, Object> signUpWithEmailPassword(String email, String password) throws Exception {
        if (email == null || email.trim().isEmpty() || password == null || password.trim().isEmpty()) {
            throw new IllegalArgumentException("Email and password cannot be empty.");
        }
        if (password.length() < 6) {
            throw new IllegalArgumentException("Password must be at least 6 characters.");
        }

        JSONObject req = new JSONObject();
        req.put("email", email.trim().toLowerCase());
        req.put("password", password);
        req.put("returnSecureToken", true);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(FIREBASE_SIGNUP_ENDPOINT))
                .timeout(Duration.ofSeconds(12))
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(req.toString(), StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
        JSONObject res = new JSONObject(response.body());

        if (response.statusCode() != 200) {
            String errorMsg = "Sign up failed.";
            if (res.has("error") && res.getJSONObject("error").has("message")) {
                String code = res.getJSONObject("error").getString("message");
                if (code.contains("EMAIL_EXISTS")) {
                    errorMsg = "An account with this email already exists.";
                } else {
                    errorMsg = code;
                }
            }
            throw new IllegalArgumentException(errorMsg);
        }

        Map<String, Object> profile = new HashMap<>();
        String idToken = res.optString("idToken", "");
        String refreshToken = res.optString("refreshToken", "");
        profile.put("uid", res.optString("localId", ""));
        profile.put("googleId", res.optString("localId", ""));
        profile.put("email", res.optString("email", email.trim().toLowerCase()));
        profile.put("displayName", email.split("@")[0]);
        profile.put("token", idToken);
        profile.put("idToken", idToken);
        profile.put("refreshToken", refreshToken);
        profile.put("plan", "free");
        profile.put("usedFiles", 0L);
        profile.put("usedBytes", 0L);

        return profile;
    }

    /**
     * Sends password reset email directly via Firebase IdentityToolkit REST HTTPS API.
     */
    public static void sendPasswordReset(String email) throws Exception {
        if (email == null || email.trim().isEmpty()) {
            throw new IllegalArgumentException("Please enter your email address.");
        }

        JSONObject req = new JSONObject();
        req.put("requestType", "PASSWORD_RESET");
        req.put("email", email.trim().toLowerCase());

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(FIREBASE_RESET_ENDPOINT))
                .timeout(Duration.ofSeconds(12))
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(req.toString(), StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            JSONObject res = new JSONObject(response.body());
            String errorMsg = "Failed to send password reset email.";
            if (res.has("error") && res.getJSONObject("error").has("message")) {
                errorMsg = res.getJSONObject("error").getString("message");
            }
            throw new IllegalArgumentException(errorMsg);
        }
    }

    /**
     * Parses an input link, callback URL, query string, or token and returns an authenticated user profile map.
     */
    public static Map<String, Object> parseAndAuthenticate(String input) throws Exception {
        if (input == null || input.trim().isEmpty()) {
            throw new IllegalArgumentException("Link or token cannot be empty.");
        }

        String raw = input.trim();
        Map<String, Object> profile = new HashMap<>();

        // Case 1: Raw JSON payload
        if (raw.startsWith("{") && raw.endsWith("}")) {
            JSONObject obj = new JSONObject(raw);
            for (String k : obj.keySet()) {
                profile.put(k, obj.get(k));
            }
            enrichFromFirestoreIfPresent(profile);
            return profile;
        }

        // Case 2: Full URL or Query String (e.g. callback URL, web link, or query string)
        if (raw.contains("?") || raw.contains("&") || raw.contains("=")) {
            String queryPart = raw.contains("?") ? raw.substring(raw.indexOf("?") + 1) : raw;
            if (queryPart.contains("#")) {
                queryPart = queryPart.substring(0, queryPart.indexOf("#"));
            }

            parseQueryString(queryPart, profile);

            if (profile.containsKey("token") && !profile.containsKey("email")) {
                Map<String, Object> lookedUp = lookupUserByToken(profile.get("token").toString());
                profile.putAll(lookedUp);
            }

            if (profile.containsKey("uid") || profile.containsKey("email")) {
                enrichFromFirestoreIfPresent(profile);
                return profile;
            }
        }

        // Case 3: Raw JWT / Firebase ID Token (e.g. eyJ...)
        if (raw.startsWith("eyJ")) {
            Map<String, Object> lookedUp = lookupUserByToken(raw);
            enrichFromFirestoreIfPresent(lookedUp);
            return lookedUp;
        }

        throw new IllegalArgumentException("Unrecognized sign-in link or token format. Please ensure you copied the complete link or token.");
    }

    /**
     * Directly calls Firebase Auth REST API over HTTPS to verify ID token and fetch user details.
     */
    public static Map<String, Object> lookupUserByToken(String idToken) throws Exception {
        JSONObject reqBody = new JSONObject();
        reqBody.put("idToken", idToken);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(FIREBASE_LOOKUP_ENDPOINT))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(reqBody.toString(), StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() == 200) {
            JSONObject res = new JSONObject(response.body());
            if (res.has("users")) {
                JSONObject u = res.getJSONArray("users").getJSONObject(0);
                Map<String, Object> map = new HashMap<>();
                map.put("uid", u.optString("localId", ""));
                map.put("googleId", u.optString("localId", ""));
                map.put("email", u.optString("email", ""));
                map.put("displayName", u.optString("displayName", u.optString("email", "User")));
                map.put("name", u.optString("displayName", u.optString("email", "User")));
                map.put("photoURL", u.optString("photoUrl", ""));
                map.put("token", idToken);
                return map;
            }
        }

        throw new IllegalStateException("HTTPS Token verification failed: " + response.body());
    }

    /**
     * Enriches the user profile by querying Firestore REST API directly over HTTPS.
     */
    public static void enrichFromFirestoreIfPresent(Map<String, Object> profile) {
        String uid = (String) profile.getOrDefault("uid", profile.getOrDefault("googleId", ""));
        if (uid == null || uid.isEmpty()) return;

        String token = (String) profile.getOrDefault("idToken", profile.getOrDefault("token", ""));

        try {
            HttpRequest.Builder reqBuilder = HttpRequest.newBuilder()
                    .uri(URI.create(FIRESTORE_USER_ENDPOINT + uid))
                    .timeout(Duration.ofSeconds(6))
                    .header("Accept", "application/json")
                    .GET();

            if (token != null && !token.isBlank()) {
                reqBuilder.header("Authorization", "Bearer " + token);
            }

            HttpResponse<String> response = HTTP_CLIENT.send(reqBuilder.build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200) {
                JSONObject doc = new JSONObject(response.body());
                if (doc.has("fields")) {
                    JSONObject fields = doc.getJSONObject("fields");

                    boolean pricingEnabled = Boolean.TRUE.equals(profile.get("enablePricingAndPayments"));
                    if (!pricingEnabled) {
                        profile.put("plan", "free");
                    } else if (fields.has("plan") && fields.getJSONObject("plan").has("stringValue")) {
                        profile.put("plan", fields.getJSONObject("plan").getString("stringValue"));
                    }
                    if (fields.has("displayName") && fields.getJSONObject("displayName").has("stringValue")) {
                        profile.put("displayName", fields.getJSONObject("displayName").getString("stringValue"));
                    }

                    long usedFiles = parseFirestoreLong(fields, "usedFiles");
                    long filesProcessed = parseFirestoreLong(fields, "filesProcessed");
                    long totalRestored = parseFirestoreLong(fields, "totalRestored");
                    long lifetimeFiles = parseFirestoreLong(fields, "lifetimeFiles");
                    long totalFilesProcessed = parseFirestoreLong(fields, "totalFilesProcessed");
                    long bestFiles = Math.max(usedFiles, Math.max(filesProcessed, Math.max(totalRestored, Math.max(lifetimeFiles, totalFilesProcessed))));

                    long usedBytes = parseFirestoreLong(fields, "usedBytes");
                    long bytesProcessed = parseFirestoreLong(fields, "bytesProcessed");
                    long totalBytes = parseFirestoreLong(fields, "totalBytes");
                    long lifetimeBytes = parseFirestoreLong(fields, "lifetimeBytes");
                    long totalBytesProcessed = parseFirestoreLong(fields, "totalBytesProcessed");
                    long bestBytes = Math.max(usedBytes, Math.max(bytesProcessed, Math.max(totalBytes, Math.max(lifetimeBytes, totalBytesProcessed))));

                    if (bestFiles > 0) {
                        profile.put("usedFiles", bestFiles);
                        profile.put("filesProcessed", bestFiles);
                        profile.put("totalRestored", bestFiles);
                        profile.put("lifetimeFiles", bestFiles);
                        profile.put("totalFilesProcessed", bestFiles);
                    }

                    if (bestBytes > 0) {
                        profile.put("usedBytes", bestBytes);
                        profile.put("bytesProcessed", bestBytes);
                        profile.put("totalBytes", bestBytes);
                        profile.put("lifetimeBytes", bestBytes);
                        profile.put("totalBytesProcessed", bestBytes);
                    }

                    if (fields.has("isAdmin") && fields.getJSONObject("isAdmin").has("booleanValue")) {
                        boolean isAdmin = fields.getJSONObject("isAdmin").getBoolean("booleanValue");
                        profile.put("isAdmin", isAdmin);
                    }
                }
            }
        } catch (Exception ignored) {
            // Fall back gracefully to existing profile data
        }
    }

    private static long parseFirestoreLong(JSONObject fields, String key) {
        if (fields.has(key)) {
            JSONObject obj = fields.optJSONObject(key);
            if (obj != null) {
                if (obj.has("integerValue")) {
                    Object iv = obj.get("integerValue");
                    if (iv instanceof Number n) return n.longValue();
                    if (iv instanceof String s) {
                        try { return Long.parseLong(s.trim()); } catch (Exception ignored) {}
                    }
                }
                if (obj.has("doubleValue")) {
                    return (long) obj.optDouble("doubleValue", 0);
                }
            }
        }
        return 0L;
    }

    private static void parseQueryString(String str, Map<String, Object> map) {
        String[] pairs = str.split("&");
        for (String pair : pairs) {
            int idx = pair.indexOf("=");
            if (idx > 0) {
                try {
                    String key = URLDecoder.decode(pair.substring(0, idx), StandardCharsets.UTF_8);
                    String value = URLDecoder.decode(pair.substring(idx + 1), StandardCharsets.UTF_8);
                    if ("usedFiles".equals(key) || "usedBytes".equals(key)) {
                        try {
                            map.put(key, Long.parseLong(value));
                            continue;
                        } catch (Exception ignored) {}
                    }
                    map.put(key, value);
                } catch (Exception ignored) {}
            }
        }
    }
}
