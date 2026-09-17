package com.takeoutfix.repository;

import com.takeoutfix.model.User;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.nio.file.Files;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Local file-backed repository persisting user accounts and active sessions to ~/.takeoutfix/users.json.
 */
public class UserRepository {

    private static final File STORAGE_FILE = new File(System.getProperty("user.home"), ".takeoutfix/users.json");
    private final Map<String, User> userCache = new ConcurrentHashMap<>();
    private volatile User currentUser = null;

    public UserRepository() {
        loadUsers();
    }

    public synchronized Optional<User> findByGoogleId(String googleId) {
        if (googleId == null) return Optional.empty();
        return Optional.ofNullable(userCache.get(googleId));
    }

    public synchronized Optional<User> findByEmail(String email) {
        if (email == null) return Optional.empty();
        return userCache.values().stream()
                .filter(u -> email.equalsIgnoreCase(u.getEmail()))
                .findFirst();
    }

    public synchronized User save(User user) {
        if (user.getGoogleId() == null || user.getGoogleId().isEmpty()) {
            user.setGoogleId("user_" + System.currentTimeMillis());
        }
        userCache.put(user.getGoogleId(), user);
        persistUsers();
        return user;
    }

    public User getCurrentUser() {
        return currentUser;
    }

    public synchronized void setCurrentUser(User user) {
        this.currentUser = user;
        persistUsers();
    }

    public synchronized void clearCurrentUser() {
        this.currentUser = null;
        persistUsers();
    }

    public synchronized void clearAll() {
        this.currentUser = null;
        this.userCache.clear();
        try {
            if (STORAGE_FILE.exists()) {
                Files.deleteIfExists(STORAGE_FILE.toPath());
            }
        } catch (Exception ignored) {}
    }

    private void loadUsers() {
        try {
            if (STORAGE_FILE.exists()) {
                String content = Files.readString(STORAGE_FILE.toPath());
                JSONObject root = new JSONObject(content);

                if (root.has("users")) {
                    JSONArray arr = root.getJSONArray("users");
                    for (int i = 0; i < arr.length(); i++) {
                        JSONObject obj = arr.getJSONObject(i);
                        User u = new User();
                        u.setId(obj.optString("id", ""));
                        u.setGoogleId(obj.optString("googleId", ""));
                        u.setEmail(obj.optString("email", ""));
                        u.setName(obj.optString("name", ""));
                        u.setProfilePicture(obj.optString("profilePicture", ""));
                        u.setPlan(obj.optString("plan", "free"));
                        u.setAccountStatus(obj.optString("accountStatus", "ACTIVE"));
                        u.setUsedFiles(obj.optLong("usedFiles", 0));
                        u.setUsedBytes(obj.optLong("usedBytes", 0));
                        if (obj.has("createdAt")) {
                            try { u.setCreatedAt(LocalDateTime.parse(obj.getString("createdAt"))); } catch (Exception ignored) {}
                        }
                        if (obj.has("lastLogin")) {
                            try { u.setLastLogin(LocalDateTime.parse(obj.getString("lastLogin"))); } catch (Exception ignored) {}
                        }
                        userCache.put(u.getGoogleId(), u);
                    }
                }

                if (root.has("currentGoogleId")) {
                    String curId = root.getString("currentGoogleId");
                    this.currentUser = userCache.get(curId);
                }
            }
        } catch (Exception ignored) {}
    }

    private synchronized void persistUsers() {
        try {
            STORAGE_FILE.getParentFile().mkdirs();
            JSONObject root = new JSONObject();
            JSONArray arr = new JSONArray();

            for (User u : userCache.values()) {
                JSONObject obj = new JSONObject();
                obj.put("id", u.getId());
                obj.put("googleId", u.getGoogleId());
                obj.put("email", u.getEmail());
                obj.put("name", u.getName());
                obj.put("profilePicture", u.getProfilePicture());
                obj.put("plan", u.getPlan());
                obj.put("accountStatus", u.getAccountStatus());
                obj.put("usedFiles", u.getUsedFiles());
                obj.put("usedBytes", u.getUsedBytes());
                if (u.getCreatedAt() != null) obj.put("createdAt", u.getCreatedAt().toString());
                if (u.getLastLogin() != null) obj.put("lastLogin", u.getLastLogin().toString());
                arr.put(obj);
            }
            root.put("users", arr);
            if (currentUser != null) {
                root.put("currentGoogleId", currentUser.getGoogleId());
            }

            Files.writeString(STORAGE_FILE.toPath(), root.toString(2));
        } catch (Exception ignored) {}
    }
}
