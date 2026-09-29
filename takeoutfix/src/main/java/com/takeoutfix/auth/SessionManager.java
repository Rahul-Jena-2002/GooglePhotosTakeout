package com.takeoutfix.auth;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;

/**
 * Manages the active user session lifecycle:
 * - Silent startup restoration from CredentialStore
 * - Fast token refresh and server-side revocation validation via FirebaseTokenService
 * - Session caching, persistence, and logout coordination
 * - Distinguishes between permanent logout (RequiresLogin) and network outage (AuthUnavailable)
 */
@Service
public class SessionManager {

    private final CredentialStore credentialStore;
    private final FirebaseTokenService tokenService;
    private final List<Consumer<AuthSession>> sessionListeners = new CopyOnWriteArrayList<>();

    private volatile AuthSession currentSession = AuthSession.unauthenticated();

    public SessionManager() {
        this(new CredentialStore(), new FirebaseTokenService());
    }

    @Autowired
    public SessionManager(CredentialStore credentialStore, FirebaseTokenService tokenService) {
        this.credentialStore = credentialStore;
        this.tokenService = tokenService;
    }

    /**
     * Silent startup restoration gate:
     * 1. Loads stored refresh token from CredentialStore.
     * 2. Exchanges refresh token for a fresh ephemeral ID token in RAM.
     * 3. Validates identity and revocation status against the backend.
     *
     * Returns:
     * - Authenticated: Session restored, fresh ID token in RAM, verified identity.
     * - RequiresLogin: No credentials, or token permanently revoked/disabled.
     * - AuthUnavailable: Network failure or timeout (preserves local session, does NOT log user out).
     */
    public synchronized SessionRestoreResult restore() {
        AuthSession stored;
        try {
            stored = credentialStore.loadSession();
        } catch (Exception e) {
            return new SessionRestoreResult.RequiresLogin("Failed to read credential storage: " + e.getMessage());
        }

        if (stored == null || !stored.isAuthenticated()) {
            return new SessionRestoreResult.RequiresLogin("No stored credentials found.");
        }

        try {
            // Fast startup: exchange durable refresh token for fresh ephemeral ID token in RAM
            AuthSession refreshed = tokenService.refreshAndVerify(stored);
            if (refreshed != null && refreshed.isAuthenticated()) {
                this.currentSession = refreshed;
                credentialStore.saveSession(refreshed);
                notifyListeners(refreshed);
                return new SessionRestoreResult.Authenticated(refreshed);
            } else {
                logout();
                return new SessionRestoreResult.RequiresLogin("Session was revoked or expired.");
            }
        } catch (AuthException ae) {
            String msg = ae.getMessage() != null ? ae.getMessage() : "";
            // Distinguish permanent account rejection from network/transient issues
            if (msg.contains("disabled") || msg.contains("revoked") || msg.contains("rejected") || msg.contains("No user record")) {
                logout();
                return new SessionRestoreResult.RequiresLogin(msg);
            }

            // Transient or network error: DO NOT log user out
            return new SessionRestoreResult.AuthUnavailable(msg, ae);
        } catch (Exception e) {
            // Network outage (DNS, Timeout, Offline)
            return new SessionRestoreResult.AuthUnavailable("Network error during session validation: " + e.getMessage(), e);
        }
    }

    /**
     * Saves a newly authenticated session and updates active listeners.
     */
    public synchronized void save(AuthSession session) {
        if (session != null && session.isAuthenticated()) {
            this.currentSession = session;
            credentialStore.saveSession(session);
            notifyListeners(session);
        }
    }

    /**
     * Terminates the session, wipes credentials from encrypted storage, and notifies listeners.
     */
    public synchronized void logout() {
        this.currentSession = AuthSession.unauthenticated();
        credentialStore.clear();
        notifyListeners(this.currentSession);
    }

    public synchronized void clear() {
        logout();
    }

    public AuthSession getCurrentSession() {
        return currentSession;
    }

    public boolean isAuthenticated() {
        return currentSession != null && currentSession.isAuthenticated();
    }

    public void addSessionListener(Consumer<AuthSession> listener) {
        sessionListeners.add(listener);
        if (currentSession != null && currentSession.isAuthenticated()) {
            listener.accept(currentSession);
        }
    }

    public void removeSessionListener(Consumer<AuthSession> listener) {
        sessionListeners.remove(listener);
    }

    private void notifyListeners(AuthSession session) {
        for (Consumer<AuthSession> listener : sessionListeners) {
            try {
                listener.accept(session);
            } catch (Exception ignored) {}
        }
    }
}
