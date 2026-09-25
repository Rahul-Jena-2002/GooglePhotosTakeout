package com.takeoutfix.auth;

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
            long directProcFiles = toLong(modifiableProfile.get("filesProcessed"));
            long directRestored = toLong(modifiableProfile.get("totalRestored"));
            long bestFiles = Math.max(existingFiles, Math.max(rawFiles, Math.max(procFiles, Math.max(lifeFiles, Math.max(directProcFiles, directRestored)))));

            long existingBytes = toLong(currentUserProfile.get("usedBytes"));
            long rawBytes = toLong(modifiableProfile.get("usedBytes"));
            long procBytes = toLong(modifiableProfile.get("totalBytesProcessed"));
            long lifeBytes = toLong(modifiableProfile.get("lifetimeBytes"));
            long directProcBytes = toLong(modifiableProfile.get("bytesProcessed"));
            long directTotalBytes = toLong(modifiableProfile.get("totalBytes"));
            long bestBytes = Math.max(existingBytes, Math.max(rawBytes, Math.max(procBytes, Math.max(lifeBytes, Math.max(directProcBytes, directTotalBytes)))));

            if (bestFiles > 0) {
                modifiableProfile.put("usedFiles", bestFiles);
                modifiableProfile.put("filesProcessed", bestFiles);
                modifiableProfile.put("totalRestored", bestFiles);
            }
            if (bestBytes > 0) {
                modifiableProfile.put("usedBytes", bestBytes);
                modifiableProfile.put("bytesProcessed", bestBytes);
                modifiableProfile.put("totalBytes", bestBytes);
            }

            currentUserProfile.putAll(modifiableProfile);
            if (profileUpdateListener != null) {
                try {
                    profileUpdateListener.accept(currentUserProfile);
                } catch (Exception ignored) {}
            }
        }
    }

    public static void incrementUsage(long files, long bytes) {
        long curFiles = toLong(currentUserProfile.get("usedFiles"));
        long curBytes = toLong(currentUserProfile.get("usedBytes"));
        long curLifeFiles = toLong(currentUserProfile.get("lifetimeFiles"));
        long curLifeBytes = toLong(currentUserProfile.get("lifetimeBytes"));
        long curTotalFiles = toLong(currentUserProfile.get("totalFilesProcessed"));
        long curTotalBytes = toLong(currentUserProfile.get("totalBytesProcessed"));

        long baseFiles = Math.max(curFiles, Math.max(curLifeFiles, curTotalFiles));
        long baseBytes = Math.max(curBytes, Math.max(curLifeBytes, curTotalBytes));

        long newFiles = baseFiles + files;
        long newBytes = baseBytes + bytes;

        currentUserProfile.put("usedFiles", newFiles);
        currentUserProfile.put("usedBytes", newBytes);
        currentUserProfile.put("totalFilesProcessed", newFiles);
        currentUserProfile.put("totalBytesProcessed", newBytes);
        currentUserProfile.put("lifetimeFiles", newFiles);
        currentUserProfile.put("lifetimeBytes", newBytes);
        currentUserProfile.put("filesProcessed", newFiles);
        currentUserProfile.put("bytesProcessed", newBytes);
        currentUserProfile.put("totalRestored", newFiles);
        currentUserProfile.put("totalBytes", newBytes);

        if (userService != null) {
            try {
                com.takeoutfix.auth.User user = userService.getCurrentUser();
                if (user != null) {
                    user.setUsedFiles(newFiles);
                    user.setUsedBytes(newBytes);
                    userService.saveUser(user);
                }
            } catch (Exception ignored) {}
        }

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

                com.takeoutfix.auth.User user = userService.loginOrCreateUser(googleId, email, name, picture);
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
        if (userService != null) {
            try {
                userService.logout();
            } catch (Exception ignored) {}
        }
        if (profileUpdateListener != null) {
            try {
                profileUpdateListener.accept(currentUserProfile);
            } catch (Exception ignored) {}
        }
    }

    private static long toLong(Object obj) {
        if (obj instanceof Number n) return n.longValue();
        if (obj instanceof String s) {
            try { return Long.parseLong(s); } catch (Exception ignored) {}        }
        return 0;
    }
}
