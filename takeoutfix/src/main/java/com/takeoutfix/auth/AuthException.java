package com.takeoutfix.auth;

/**
 * Authentication exception thrown when OAuth, token exchange, or session validation fails.
 */
public class AuthException extends Exception {

    public AuthException(String message) {
        super(message);
    }

    public AuthException(String message, Throwable cause) {
        super(message, cause);
    }
}
