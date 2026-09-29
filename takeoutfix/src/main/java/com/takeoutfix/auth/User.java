package com.takeoutfix.auth;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

/**
 * Domain entity representing a TakeoutFix user authenticated via Google OAuth2.
 * Stores Google's 'sub' claim as the permanent identity key rather than email alone.
 */
public class User {

    private String id;
    private String googleId;
    private String email;
    private String name;
    private String profilePicture;
    private String plan; // 'free', 'pro', 'super'
    private String accountStatus; // 'ACTIVE', 'SUSPENDED'
    private LocalDateTime createdAt;
    private LocalDateTime lastLogin;
    private long usedFiles;
    private long usedBytes;

    public User() {
        this.plan = "free";
        this.accountStatus = "ACTIVE";
        this.createdAt = LocalDateTime.now();
        this.lastLogin = LocalDateTime.now();
    }

    public User(String googleId, String email, String name, String profilePicture) {
        this();
        this.id = googleId;
        this.googleId = googleId;
        this.email = email;
        this.name = name;
        this.profilePicture = profilePicture;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getGoogleId() {
        return googleId;
    }

    public void setGoogleId(String googleId) {
        this.googleId = googleId;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getProfilePicture() {
        return profilePicture;
    }

    public void setProfilePicture(String profilePicture) {
        this.profilePicture = profilePicture;
    }

    public String getPlan() {
        return plan != null ? plan : "free";
    }

    public void setPlan(String plan) {
        this.plan = plan;
    }

    public String getAccountStatus() {
        return accountStatus != null ? accountStatus : "ACTIVE";
    }

    public void setAccountStatus(String accountStatus) {
        this.accountStatus = accountStatus;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getLastLogin() {
        return lastLogin;
    }

    public void setLastLogin(LocalDateTime lastLogin) {
        this.lastLogin = lastLogin;
    }

    public long getUsedFiles() {
        return usedFiles;
    }

    public void setUsedFiles(long usedFiles) {
        this.usedFiles = usedFiles;
    }

    public long getUsedBytes() {
        return usedBytes;
    }

    public void setUsedBytes(long usedBytes) {
        this.usedBytes = usedBytes;
    }

    public Map<String, Object> toMap() {
        Map<String, Object> map = new HashMap<>();
        map.put("id", id);
        map.put("googleId", googleId);
        map.put("email", email);
        map.put("name", name);
        map.put("profilePicture", profilePicture);
        map.put("plan", getPlan());
        map.put("accountStatus", getAccountStatus());
        map.put("createdAt", createdAt != null ? createdAt.toString() : null);
        map.put("lastLogin", lastLogin != null ? lastLogin.toString() : null);
        map.put("usedFiles", usedFiles);
        map.put("usedBytes", usedBytes);
        return map;
    }
}
