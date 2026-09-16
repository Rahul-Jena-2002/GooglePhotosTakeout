package com.rahul.service;

import com.rahul.controller.UserController;
import com.rahul.model.User;
import com.rahul.repository.UserRepository;
import java.io.File;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Authoritative business service for authentication, user management, and quota limits.
 */
public class UserService {

    private final UserRepository userRepository;

    public UserService() {
        this(new UserRepository());
    }

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;

        // Restore initial user into UserController on startup only if session.json exists
        File sessionFile = new File(System.getProperty("user.home"), ".takeoutfix/session.json");
        if (sessionFile.exists()) {
            User existing = userRepository.getCurrentUser();
            if (existing != null) {
                syncToGuiBridge(existing);
            }
        } else {
            userRepository.clearCurrentUser();
        }
    }

    public synchronized User loginOrCreateUser(String googleId, String email, String name, String picture) {
        Optional<User> existing = userRepository.findByGoogleId(googleId);
        if (existing.isEmpty() && email != null) {
            existing = userRepository.findByEmail(email);
        }

        User user;
        if (existing.isPresent()) {
            user = existing.get();
            user.setGoogleId(googleId);
            if (name != null && !name.isEmpty()) user.setName(name);
            if (picture != null && !picture.isEmpty()) user.setProfilePicture(picture);
            user.setLastLogin(LocalDateTime.now());
        } else {
            user = new User(googleId, email, name, picture);
        }

        userRepository.save(user);
        userRepository.setCurrentUser(user);
        syncToGuiBridge(user);

        return user;
    }

    public boolean isAuthenticated() {
        return userRepository.getCurrentUser() != null && !UserController.getCurrentUserProfile().isEmpty();
    }

    public User getCurrentUser() {
        return userRepository.getCurrentUser();
    }

    public void logout() {
        userRepository.clearCurrentUser();
        UserController.getCurrentUserProfile().clear();
    }

    /**
     * Authoritative backend authorization check for restorations.
     */
    public boolean isAllowedToExtract(long nextFilesCount, long nextBytesCount) {
        User user = getCurrentUser();
        if (user == null) {
            return false;
        }

        String plan = user.getPlan();
        if ("super".equalsIgnoreCase(plan) || "pro".equalsIgnoreCase(plan)) {
            return true;
        }

        // Free tier limits: 250 files / 500 MB
        long maxFiles = 250;
        long maxBytes = 500L * 1024 * 1024;

        boolean filesAllowed = (user.getUsedFiles() + nextFilesCount) <= maxFiles;
        boolean bytesAllowed = (user.getUsedBytes() + nextBytesCount) <= maxBytes;

        return filesAllowed && bytesAllowed;
    }

    public void recordUsage(long files, long bytes) {
        User user = getCurrentUser();
        if (user != null) {
            user.setUsedFiles(user.getUsedFiles() + files);
            user.setUsedBytes(user.getUsedBytes() + bytes);
            userRepository.save(user);
            syncToGuiBridge(user);
        }
    }

    public void updateUserPlan(String plan) {
        User user = getCurrentUser();
        if (user != null) {
            user.setPlan(plan);
            userRepository.save(user);
            syncToGuiBridge(user);
        }
    }

    /**
     * Persist an arbitrary User object (e.g. after syncing quota from Firestore) and refresh the GUI.
     */
    public void saveUser(User user) {
        userRepository.save(user);
        userRepository.setCurrentUser(user);
        syncToGuiBridge(user);
    }

    private void syncToGuiBridge(User user) {
        Map<String, Object> map = new HashMap<>();
        map.put("uid", user.getGoogleId());
        map.put("googleId", user.getGoogleId());
        map.put("email", user.getEmail());
        map.put("displayName", user.getName());
        map.put("name", user.getName());
        map.put("photoURL", user.getProfilePicture());
        map.put("plan", user.getPlan());
        map.put("usedFiles", user.getUsedFiles());
        map.put("usedBytes", user.getUsedBytes());
        UserController.updateUserProfile(map);
    }
}
