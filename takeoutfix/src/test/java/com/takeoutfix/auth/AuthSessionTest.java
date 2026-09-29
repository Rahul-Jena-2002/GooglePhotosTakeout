package com.takeoutfix.auth;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

public class AuthSessionTest {

    @Test
    public void testAuthSessionValidity() {
        AuthSession session = new AuthSession(
                "uid-123",
                "user@gmail.com",
                "John Doe",
                "https://photos.google.com/p.jpg",
                "idTokenABC",
                "refreshTokenXYZ",
                "pro",
                System.currentTimeMillis() + 3600_000
        );

        assertTrue(session.isValid());
        assertFalse(session.isTokenExpired());
        assertEquals("uid-123", session.getUid());
        assertEquals("user@gmail.com", session.getEmail());
        assertEquals("John Doe", session.getDisplayName());
        assertEquals("pro", session.getPlan());
        assertEquals("google", session.getProvider());

        Map<String, Object> map = session.toMap();
        assertEquals("uid-123", map.get("uid"));
        assertEquals("user@gmail.com", map.get("email"));

        AuthSession restored = AuthSession.fromMap(map);
        assertNotNull(restored);
        assertEquals(session.getUid(), restored.getUid());
        assertEquals(session.getEmail(), restored.getEmail());
        assertEquals(session.getPlan(), restored.getPlan());
    }

    @Test
    public void testTokenExpiryDetection() {
        // Expired token (expires in the past)
        AuthSession expired = new AuthSession(
                "uid-123",
                "user@gmail.com",
                "John",
                "",
                "expiredToken",
                "refreshMe",
                "free",
                System.currentTimeMillis() - 1000
        );

        assertTrue(expired.isTokenExpired());
    }
}
