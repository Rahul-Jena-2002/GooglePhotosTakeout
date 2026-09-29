package com.takeoutfix.auth;

/**
 * Result model for startup session restoration:
 * - Authenticated: Token refreshed in RAM, identity verified with backend.
 * - RequiresLogin: No stored credentials found, or refresh token was permanently revoked / invalid.
 * - AuthUnavailable: Network timeout, offline, or transient backend failure (preserves local session, does NOT log user out).
 */
public sealed interface SessionRestoreResult permits
        SessionRestoreResult.Authenticated,
        SessionRestoreResult.RequiresLogin,
        SessionRestoreResult.AuthUnavailable {

    record Authenticated(AuthSession session) implements SessionRestoreResult {}
    record RequiresLogin(String reason) implements SessionRestoreResult {}
    record AuthUnavailable(String reason, Throwable cause) implements SessionRestoreResult {}

    default boolean isAuthenticated() {
        return this instanceof Authenticated;
    }

    default AuthSession getSessionOrNull() {
        if (this instanceof Authenticated a) {
            return a.session();
        }
        return null;
    }
}
