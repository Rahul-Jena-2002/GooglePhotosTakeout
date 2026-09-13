package com.rahul.controller;

import com.rahul.model.User;
import com.rahul.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * Authentication REST controller providing authentication status, profile telemetry, and logout.
 */
@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
public class AuthController {

    private final UserService userService;

    @Autowired
    public AuthController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getAuthStatus() {
        Map<String, Object> response = new HashMap<>();
        boolean authenticated = userService.isAuthenticated();
        response.put("authenticated", authenticated);

        if (authenticated) {
            User user = userService.getCurrentUser();
            response.put("googleId", user.getGoogleId());
            response.put("email", user.getEmail());
            response.put("name", user.getName());
            response.put("picture", user.getProfilePicture());
            response.put("plan", user.getPlan());
            response.put("accountStatus", user.getAccountStatus());
            response.put("usedFiles", user.getUsedFiles());
            response.put("usedBytes", user.getUsedBytes());
        }

        return ResponseEntity.ok(response);
    }

    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> getCurrentUser() {
        if (!userService.isAuthenticated()) {
            return ResponseEntity.status(401).body(Map.of("error", "Not authenticated"));
        }
        return ResponseEntity.ok(userService.getCurrentUser().toMap());
    }

    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout() {
        userService.logout();
        return ResponseEntity.ok(Map.of("status", "logged_out"));
    }
}
