package com.rahul.controller;

import com.rahul.service.UserService;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

/**
 * In-memory profile and state manager for the active TakeoutFix user session.
 */
public class UserController {

    private static final Map<String, Object> currentUserProfile = new ConcurrentHashMap<>();
    private static Consumer<Map<String, Object>> profileUpdateListener = null;

    private static UserService userService = null;

    public static void setUserService(UserService service) {
        userService = service;
    }

    public static void setProfileUpdateListener(Consumer<Map<String, Object>> listener) {
        profileUpdateListener = listener;
    }

    public static Map<String, Object> getCurrentUserProfile() {
        return currentUserProfile;
    }

    public static void updateUserProfile(Map<String, Object> profile) {
        if (profile != null) {
            Map<String, Object> modifiableProfile = new java.util.HashMap<>(profile);
            long existingFiles = toLong(currentUserProfile.get("usedFiles"));
            long rawFiles = toLong(modifiableProfile.get("usedFiles"));
            long procFiles = toLong(modifiableProfile.get("totalFilesProcessed"));
            long lifeFiles = toLong(modifiableProfile.get("lifetimeFiles"));
            long bestFiles = Math.max(existingFiles, Math.max(rawFiles, Math.max(procFiles, lifeFiles)));

            long existingBytes = toLong(currentUserProfile.get("usedBytes"));
            long rawBytes = toLong(modifiableProfile.get("usedBytes"));
            long procBytes = toLong(modifiableProfile.get("totalBytesProcessed"));
            long lifeBytes = toLong(modifiableProfile.get("lifetimeBytes"));
            long bestBytes = Math.max(existingBytes, Math.max(rawBytes, Math.max(procBytes, lifeBytes)));

            if (bestFiles > 0) modifiableProfile.put("usedFiles", bestFiles);
            if (bestBytes > 0) modifiableProfile.put("usedBytes", bestBytes);

            currentUserProfile.putAll(modifiableProfile);
            if (profileUpdateListener != null) {
                try {
                    profileUpdateListener.accept(currentUserProfile);
                } catch (Exception ignored) {}
            }
        }
    }

    public static void incrementUsage(long files, long bytes) {
        long curFiles = 0;
        if (currentUserProfile.get("usedFiles") instanceof Number num) curFiles = num.longValue();
        long curBytes = 0;
        if (currentUserProfile.get("usedBytes") instanceof Number num) curBytes = num.longValue();

        currentUserProfile.put("usedFiles", curFiles + files);
        currentUserProfile.put("usedBytes", curBytes + bytes);
        if (profileUpdateListener != null) {
            try {
                profileUpdateListener.accept(currentUserProfile);
            } catch (Exception ignored) {}
        }
    }

    public static void syncUser(Map<String, Object> profile) {
        updateUserProfile(profile);

        if (userService != null) {
            try {
                String googleId = (String) profile.getOrDefault("uid", profile.getOrDefault("googleId", ""));
                String email = (String) profile.getOrDefault("email", "");
                String name = (String) profile.getOrDefault("displayName", profile.getOrDefault("name", ""));
                String picture = (String) profile.getOrDefault("photoURL", profile.getOrDefault("picture", ""));
                String plan = (String) profile.getOrDefault("plan", "free");

                com.rahul.model.User user = userService.loginOrCreateUser(googleId, email, name, picture);
                user.setPlan(plan);

                long rawFiles = toLong(profile.get("usedFiles"));
                long procFiles = toLong(profile.get("totalFilesProcessed"));
                long lifeFiles = toLong(profile.get("lifetimeFiles"));
                long usedFiles = Math.max(rawFiles, Math.max(procFiles, lifeFiles));

                long rawBytes = toLong(profile.get("usedBytes"));
                long procBytes = toLong(profile.get("totalBytesProcessed"));
                long lifeBytes = toLong(profile.get("lifetimeBytes"));
                long usedBytes = Math.max(rawBytes, Math.max(procBytes, lifeBytes));

                if (usedFiles > user.getUsedFiles()) user.setUsedFiles(usedFiles);
                if (usedBytes > user.getUsedBytes()) user.setUsedBytes(usedBytes);

                userService.saveUser(user);
            } catch (Exception ignored) {}
        }
    }

    public static void logout() {
        currentUserProfile.clear();
        if (profileUpdateListener != null) {
            try {
                profileUpdateListener.accept(currentUserProfile);
            } catch (Exception ignored) {}
        }
    }

    private static long toLong(Object obj) {
        if (obj instanceof Number n) return n.longValue();
        if (obj instanceof String s) {
            try { return Long.parseLong(s); } catch (Exception ignored) {}
        }
        return 0;
    }
}
