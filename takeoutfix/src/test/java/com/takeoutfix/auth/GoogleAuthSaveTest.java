package com.takeoutfix.auth;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class GoogleAuthSaveTest {
    @TempDir Path tempDir;

    @Test
    void deferredSignInDoesNotSaveButDefaultSignInDoes() {
        AuthSession expected = new AuthSession("uid", "user@example.invalid", "User", "", "id", "refresh", "free", 0);
        FirebaseTokenService tokens = new FirebaseTokenService() {
            @Override public AuthSession exchangeGoogleCredential(Map<String, Object> params) { return expected; }
        };
        AtomicReference<AuthSession> saved = new AtomicReference<>();
        SessionManager sessions = new SessionManager(new CredentialStore(tempDir.toFile()), tokens) {
            @Override public synchronized void save(AuthSession session) { saved.set(session); }
        };
        class Callback extends AuthCallbackServer {
            CompletableFuture<Map<String, Object>> response;
            boolean stopped;
            @Override public synchronized int start(String state, CompletableFuture<Map<String, Object>> future) {
                response = future;
                return 12345;
            }
            @Override public synchronized void stop() { stopped = true; }
        }
        Callback callback = new Callback();
        GoogleAuthService service = new GoogleAuthService(() -> callback, tokens, sessions, url -> true);

        CompletableFuture<AuthSession> deferred = service.authenticate(false);
        callback.response.complete(new java.util.HashMap<>());
        assertSame(expected, deferred.join());
        assertNull(saved.get());

        CompletableFuture<AuthSession> regular = service.authenticate();
        callback.response.complete(new java.util.HashMap<>());
        assertSame(expected, regular.join());
        assertSame(expected, saved.get());

        callback.stopped = false;
        CompletableFuture<AuthSession> cancelled = service.authenticate(false);
        assertTrue(cancelled.cancel(false));
        assertTrue(callback.stopped);
        assertTrue(callback.response.isCancelled());
    }
}
