package com.takeoutfix.network;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicReference;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("DesktopAuthServer Callback & Parsing Tests")
public class DesktopAuthServerTest {

    @Test
    @DisplayName("Verify processManualAuth handles full callback URLs")
    void testProcessManualAuthWithUrl() {
        String callbackUrl = "http://127.0.0.1:35727/callback?uid=test12345&email=rahul@example.com&displayName=Rahul&plan=pro";
        AtomicReference<Map<String, Object>> captured = new AtomicReference<>();

        boolean result = DesktopAuthServer.processManualAuth(callbackUrl, captured::set);

        assertTrue(result, "Manual auth should succeed with valid URL");
        assertNotNull(captured.get(), "Captured profile must not be null");
        assertEquals("rahul@example.com", captured.get().get("email"));
        assertEquals("test12345", captured.get().get("uid"));
    }

    @Test
    @DisplayName("Verify processManualAuth handles JSON payload strings")
    void testProcessManualAuthWithJson() {
        String jsonPayload = "{\"uid\":\"u999\",\"email\":\"alex@example.com\",\"name\":\"Alex\",\"plan\":\"super\"}";
        AtomicReference<Map<String, Object>> captured = new AtomicReference<>();

        boolean result = DesktopAuthServer.processManualAuth(jsonPayload, captured::set);

        assertTrue(result, "Manual auth should succeed with JSON payload");
        assertNotNull(captured.get());
        assertEquals("alex@example.com", captured.get().get("email"));
        assertEquals("u999", captured.get().get("uid"));
    }

    @Test
    @DisplayName("Verify processManualAuth gracefully rejects empty and invalid strings")
    void testProcessManualAuthInvalid() {
        assertFalse(DesktopAuthServer.processManualAuth("", null));
        assertFalse(DesktopAuthServer.processManualAuth("   ", null));
        assertFalse(DesktopAuthServer.processManualAuth("invalid_random_string", null));
    }
}
