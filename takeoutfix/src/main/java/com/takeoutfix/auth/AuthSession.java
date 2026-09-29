package com.takeoutfix.auth;

import org.json.JSONObject;

import java.io.Serializable;
import java.util.HashMap;
import java.util.Map;

/**
 * Immutable authenticated user session model for Google OAuth & Firebase Authentication.
 */
public class AuthSession implements Serializable {

    private static final long serialVersionUID = 1L;

    private final String uid;
    private final String email;
    private final String displayName;
    private final String photoUrl;
    private final String idToken;
    private final String refreshToken;
    private final String plan;
    private final long expiresAt;
    private final String provider;

    public AuthSession(String uid, String email, String displayName, String photoUrl,
                       String idToken, String refreshToken, String plan, long expiresAt) {
        this.uid = uid != null ? uid.trim() : "";
        this.email = email != null ? email.trim().toLowerCase() : "";
        this.displayName = displayName != null && !displayName.isBlank()
                ? displayName.trim()
                : (this.email.contains("@") ? this.email.split("@")[0] : "User");
        this.photoUrl = photoUrl != null ? photoUrl.trim() : "";
        this.idToken = idToken != null ? idToken.trim() : "";
        this.refreshToken = refreshToken != null ? refreshToken.trim() : "";
        this.plan = plan != null && !plan.isBlank() ? plan.trim() : "free";
        this.expiresAt = expiresAt;
        this.provider = "google";
    }

    public static AuthSession unauthenticated() {
        return new AuthSession("", "", "", "", "", "", "none", 0L);
    }

    public String getUid() {
        return uid;
    }

    public String getEmail() {
        return email;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getPhotoUrl() {
        return photoUrl;
    }

    public String getIdToken() {
        return idToken;
    }

    public String getRefreshToken() {
        return refreshToken;
    }

    public String getPlan() {
        return plan;
    }

    public long getExpiresAt() {
        return expiresAt;
    }

    public String getProvider() {
        return provider;
    }

    /**
     * Checks if this session contains an authenticated identity with valid tokens.
     */
    public boolean isAuthenticated() {
        return !uid.isEmpty() && !email.isEmpty() && (!idToken.isEmpty() || !refreshToken.isEmpty());
    }

    /**
     * Compatibility alias for isAuthenticated().
     */
    public boolean isValid() {
        return isAuthenticated();
    }

    /**
     * Checks if the Firebase ID token is expired or close to expiry (within 60 seconds).
     */
    public boolean isTokenExpired() {
        if (expiresAt <= 0) return false;
        return System.currentTimeMillis() >= (expiresAt - 60_000);
    }

    public Map<String, Object> toMap() {
        Map<String, Object> map = new HashMap<>();
        map.put("uid", uid);
        map.put("googleId", uid);
        map.put("email", email);
        map.put("displayName", displayName);
        map.put("name", displayName);
        map.put("photoURL", photoUrl);
        map.put("idToken", idToken);
        map.put("token", idToken);
        map.put("refreshToken", refreshToken);
        map.put("plan", plan);
        map.put("expiresAt", expiresAt);
        map.put("provider", provider);
        return map;
    }

    public static AuthSession fromMap(Map<String, Object> map) {
        if (map == null || map.isEmpty()) return null;
        String uid = String.valueOf(map.getOrDefault("uid", map.getOrDefault("googleId", "")));
        String email = String.valueOf(map.getOrDefault("email", ""));
        String displayName = String.valueOf(map.getOrDefault("displayName", map.getOrDefault("name", "")));
        String photoUrl = String.valueOf(map.getOrDefault("photoURL", map.getOrDefault("photoUrl", "")));
        String idToken = String.valueOf(map.getOrDefault("idToken", map.getOrDefault("token", "")));
        String refreshToken = String.valueOf(map.getOrDefault("refreshToken", ""));
        String plan = String.valueOf(map.getOrDefault("plan", "free"));
        long expiresAt = 0L;
        Object expObj = map.get("expiresAt");
        if (expObj instanceof Number n) {
            expiresAt = n.longValue();
        } else if (expObj != null) {
            try { expiresAt = Long.parseLong(expObj.toString()); } catch (Exception ignored) {}
        }
        return new AuthSession(uid, email, displayName, photoUrl, idToken, refreshToken, plan, expiresAt);
    }

    public JSONObject toPublicJson() {
        return toJson();
    }

    public JSONObject toJson() {
        JSONObject json = new JSONObject();
        json.put("uid", uid);
        json.put("localId", uid);
        json.put("email", email);
        json.put("displayName", displayName);
        json.put("photoURL", photoUrl);
        json.put("plan", plan);
        json.put("provider", provider);
        json.put("idToken", idToken);
        json.put("token", idToken);
        json.put("refreshToken", refreshToken);
        json.put("expiresAt", expiresAt);
        json.put("lastActive", System.currentTimeMillis());
        return json;
    }

    public AuthSession withNewTokens(String newIdToken, String newRefreshToken, long newExpiresAt, String updatedPlan) {
        return new AuthSession(
                this.uid,
                this.email,
                this.displayName,
                this.photoUrl,
                newIdToken != null && !newIdToken.isBlank() ? newIdToken : this.idToken,
                newRefreshToken != null && !newRefreshToken.isBlank() ? newRefreshToken : this.refreshToken,
                updatedPlan != null && !updatedPlan.isBlank() ? updatedPlan : this.plan,
                newExpiresAt > 0 ? newExpiresAt : this.expiresAt
        );
    }

    @Override
    public String toString() {
        return "AuthSession{" +
                "uid='" + uid + '\'' +
                ", email='" + email + '\'' +
                ", displayName='" + displayName + '\'' +
                ", plan='" + plan + '\'' +
                ", authenticated=" + isAuthenticated() +
                '}';
    }
}
