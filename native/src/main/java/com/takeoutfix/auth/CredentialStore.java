package com.takeoutfix.auth;

import com.github.javakeyring.Keyring;
import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import org.springframework.stereotype.Component;

import java.util.Base64;

/**
 * Production-Grade Secure Credential Storage for TakeoutFix Desktop.
 *
 * Architecture:
 * - Public metadata (~/.takeoutfix/session.json): Non-sensitive account descriptors (uid, email, displayName, plan).
 * - Ephemeral ID token & Long-Lived Refresh Token:
 *     * Primary: Native OS Credential Facility via Keyring (Windows Credential Manager, macOS Keychain, Linux Secret Service)
 *     * Fallback: Authenticated AES-256-GCM encrypted vault (.credentials.enc) bound to user and machine entropy
 *     * Plaintext tokens are NEVER stored in session.json.
 */
@Component
public class CredentialStore {

    public enum StorageTier {
        OS_KEYRING,
        ENCRYPTED_VAULT_FALLBACK,
        NONE
    }

    private static final Logger log = LoggerFactory.getLogger(CredentialStore.class);
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private static final File CONFIG_DIR = new File(System.getProperty("user.home"), ".takeoutfix");
    private static final File SESSION_METADATA_FILE = new File(CONFIG_DIR, "session.json");
    private static final File ENCRYPTED_CREDENTIALS_FILE = new File(CONFIG_DIR, ".credentials.enc");

    private static final String SERVICE_NAME = "TakeoutFix";
    private static final String KEY_EMAIL = "email";
    private static final String KEY_REFRESH_TOKEN = "refreshToken";
    private static final String KEY_ID_TOKEN = "idToken";

    private static final int GCM_TAG_LENGTH = 128;
    private static final int GCM_IV_LENGTH = 12;
    private static final int PBKDF2_ITERATIONS = 65_536;
    private static final int KEY_LENGTH = 256;

    public CredentialStore() {
        if (!CONFIG_DIR.exists()) {
            CONFIG_DIR.mkdirs();
        }
    }

    /**
     * Loads session credentials. Reads metadata from session.json and tokens from OS Keyring.
     */
    public synchronized AuthSession loadSession() {
        try {
            if (!SESSION_METADATA_FILE.exists()) {
                return null;
            }

            String metaContent = Files.readString(SESSION_METADATA_FILE.toPath(), StandardCharsets.UTF_8);
            if (metaContent == null || metaContent.isBlank()) {
                return null;
            }

            JSONObject meta = new JSONObject(metaContent);
            String uid = meta.optString("uid", meta.optString("localId", ""));
            String email = meta.optString(KEY_EMAIL, "");
            if (email.isBlank()) {
                return null;
            }

            String displayName = meta.optString("displayName", email.split("@")[0]);
            String photoUrl = meta.optString("photoURL", meta.optString("photoUrl", ""));
            String plan = meta.optString("plan", "free");
            long expiresAt = meta.optLong("expiresAt", 0L);

            // Fetch tokens from secure OS Keyring (or encrypted fallback)
            String refreshToken = null;
            String idToken = null;

            JSONObject securePayload = loadTokensFromSecureStore(email);
            if (securePayload != null) {
                refreshToken = securePayload.optString(KEY_REFRESH_TOKEN, "");
                idToken = securePayload.optString(KEY_ID_TOKEN, "");
            }

            // Compatibility fallback if migrating from older plaintext session.json
            if ((refreshToken == null || refreshToken.isBlank()) && meta.has(KEY_REFRESH_TOKEN)) {
                refreshToken = meta.optString(KEY_REFRESH_TOKEN, "");
                if (idToken == null || idToken.isBlank()) {
                    idToken = meta.optString(KEY_ID_TOKEN, meta.optString("token", ""));
                }
            }

            if (refreshToken == null || refreshToken.isBlank()) {
                return null;
            }

            return new AuthSession(uid, email, displayName, photoUrl, idToken != null ? idToken : "", refreshToken, plan, expiresAt);
        } catch (Exception e) {
            log.error("[CredentialStore] Failed to load session", e);
        }
        return null;
    }

    /**
     * Saves session: persists tokens into OS Keyring and public profile metadata to session.json.
     */
    public synchronized void saveSession(AuthSession session) {
        if (session == null || !session.isAuthenticated()) {
            return;
        }

        try {
            if (!CONFIG_DIR.exists()) {
                CONFIG_DIR.mkdirs();
            }

            // 1. Securely store tokens in OS Keyring / Encrypted Vault
            saveTokensToSecureStore(session.getEmail(), session.getRefreshToken(), session.getIdToken());

            // 2. Persist public metadata ONLY to session.json (No plaintext tokens)
            JSONObject meta = new JSONObject();
            meta.put("uid", session.getUid());
            meta.put("localId", session.getUid());
            meta.put(KEY_EMAIL, session.getEmail());
            meta.put("displayName", session.getDisplayName());
            meta.put("photoURL", session.getPhotoUrl());
            meta.put("plan", session.getPlan());
            meta.put("expiresAt", session.getExpiresAt());
            meta.put("lastActive", System.currentTimeMillis());

            Files.writeString(SESSION_METADATA_FILE.toPath(), meta.toString(2), StandardCharsets.UTF_8);

        } catch (Exception e) {
            log.error("[CredentialStore] Failed to save credentials", e);
        }
    }

    /**
     * Wipes credentials completely from OS Keyring, encrypted vault, and session.json.
     * Each step is isolated so that failure in one does not abort the remaining cleanup steps.
     */
    public synchronized void clear() {
        // 1. Extract email BEFORE deleting the metadata file
        String accountEmail = null;
        if (SESSION_METADATA_FILE.exists()) {
            try {
                String metaContent = Files.readString(SESSION_METADATA_FILE.toPath(), StandardCharsets.UTF_8);
                if (metaContent != null && !metaContent.isBlank()) {
                    JSONObject meta = new JSONObject(metaContent);
                    accountEmail = meta.optString(KEY_EMAIL, null);
                }
            } catch (Exception e) {
                log.warn("[CredentialStore] Failed reading session metadata during clear(): {}", e.getMessage());
            }
        }

        // 2. Delete from OS Keyring (Isolated try-catch, explicit logging, non-aborting)
        if (accountEmail != null && !accountEmail.isBlank()) {
            try (Keyring keyring = Keyring.create()) {
                keyring.deletePassword(SERVICE_NAME, accountEmail);
                log.info("[CredentialStore] Cleared credentials from OS Keyring for {}", accountEmail);
            } catch (Exception e) {
                log.error("[CredentialStore] Failed to remove credentials from OS Keyring for {}: {}", accountEmail, e.getMessage(), e);
            }
        }

        // 3. Delete encrypted fallback vault (Isolated try-catch)
        if (ENCRYPTED_CREDENTIALS_FILE.exists()) {
            try {
                Files.deleteIfExists(ENCRYPTED_CREDENTIALS_FILE.toPath());
            } catch (Exception e) {
                log.error("[CredentialStore] Failed to delete encrypted credentials vault file: {}", e.getMessage(), e);
            }
        }

        // 4. Delete session metadata file (Isolated try-catch, guaranteed to run)
        if (SESSION_METADATA_FILE.exists()) {
            try {
                Files.deleteIfExists(SESSION_METADATA_FILE.toPath());
            } catch (Exception e) {
                log.error("[CredentialStore] Failed to delete session.json: {}", e.getMessage(), e);
            }
        }
    }

    public synchronized boolean hasStoredCredential() {
        if (!SESSION_METADATA_FILE.exists()) {
            return false;
        }
        try {
            String metaContent = Files.readString(SESSION_METADATA_FILE.toPath(), StandardCharsets.UTF_8);
            if (metaContent == null || metaContent.isBlank()) {
                return false;
            }
            JSONObject meta = new JSONObject(metaContent);
            String email = meta.optString(KEY_EMAIL, "");
            if (email.isBlank()) {
                return false;
            }

            // Verify refreshToken presence in OS Keyring, Encrypted Vault, or metadata
            if (hasSecureTokens(email)) {
                return true;
            }
            return !meta.optString(KEY_REFRESH_TOKEN, "").isBlank();
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Determines which storage tier is currently safeguarding credentials for the given account.
     */
    public StorageTier getStorageTier(String account) {
        if (account != null && !account.isBlank()) {
            try (Keyring keyring = Keyring.create()) {
                String secret = keyring.getPassword(SERVICE_NAME, account);
                if (secret != null && !secret.isBlank()) {
                    return StorageTier.OS_KEYRING;
                }
            } catch (Exception ignored) {
                // Keyring unavailable on this system
            }
        }
        if (ENCRYPTED_CREDENTIALS_FILE.exists()) {
            return StorageTier.ENCRYPTED_VAULT_FALLBACK;
        }
        return StorageTier.NONE;
    }

    // ── OS Keyring & Authenticated AES-GCM Storage ───────────────────────────

    private void saveTokensToSecureStore(String account, String refreshToken, String idToken) {
        JSONObject payload = new JSONObject();
        payload.put(KEY_REFRESH_TOKEN, refreshToken != null ? refreshToken : "");
        payload.put(KEY_ID_TOKEN, idToken != null ? idToken : "");
        payload.put("savedAt", System.currentTimeMillis());

        String serialized = payload.toString();
        boolean keyringSuccess = false;

        // 1. Attempt writing to OS Native Keyring (Windows Credential Manager / macOS Keychain / Linux Secret Service)
        try (Keyring keyring = Keyring.create()) {
            keyring.setPassword(SERVICE_NAME, account, serialized);
            keyringSuccess = true;
            // Clean up any stale fallback file so tokens don't linger on disk
            if (ENCRYPTED_CREDENTIALS_FILE.exists()) {
                Files.deleteIfExists(ENCRYPTED_CREDENTIALS_FILE.toPath());
            }
        } catch (Exception t) {
            log.warn("[CredentialStore] OS native keyring not available (Windows Credential Manager / Keychain / Secret Service). Falling back to AES-256-GCM vault: {}", t.getMessage());
        }

        // 2. Only write encrypted fallback if OS Keyring failed
        if (!keyringSuccess) {
            saveEncryptedBackup(serialized);
        }
    }

    private JSONObject loadTokensFromSecureStore(String account) {
        // 1. Try OS Native Keyring first
        try (Keyring keyring = Keyring.create()) {
            String secret = keyring.getPassword(SERVICE_NAME, account);
            if (secret != null && !secret.isBlank()) {
                return new JSONObject(secret);
            }
        } catch (Exception t) {
            log.debug("[CredentialStore] OS native keyring read failed, trying encrypted vault: {}", t.getMessage());
        }

        // 2. Fall back to AES-256-GCM Encrypted Vault
        if (ENCRYPTED_CREDENTIALS_FILE.exists()) {
            try {
                String encContent = Files.readString(ENCRYPTED_CREDENTIALS_FILE.toPath(), StandardCharsets.UTF_8);
                if (encContent != null && !encContent.isBlank()) {
                    String decrypted = decrypt(encContent.trim());
                    if (decrypted != null && !decrypted.isBlank()) {
                        return new JSONObject(decrypted);
                    }
                }
            } catch (Exception ignored) {
                // Decryption error or corrupt file
            }
        }

        return null;
    }

    private boolean hasSecureTokens(String account) {
        try (Keyring keyring = Keyring.create()) {
            String secret = keyring.getPassword(SERVICE_NAME, account);
            if (secret != null && !secret.isBlank()) {
                return true;
            }
        } catch (Exception ignored) {
            // Keyring unavailable
        }
        return ENCRYPTED_CREDENTIALS_FILE.exists();
    }

    private void saveEncryptedBackup(String serialized) {
        try {
            String encrypted = encrypt(serialized);
            Files.writeString(ENCRYPTED_CREDENTIALS_FILE.toPath(), encrypted, StandardCharsets.UTF_8);
            restrictPosixPermissions();
        } catch (Exception e) {
            log.error("[CredentialStore] Failed to write encrypted credential backup", e);
        }
    }

    private void restrictPosixPermissions() {
        if (!System.getProperty("os.name", "").toLowerCase().contains("win")) {
            try {
                Files.setPosixFilePermissions(ENCRYPTED_CREDENTIALS_FILE.toPath(),
                        java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));
            } catch (Exception ignored) {
                // Posix permissions unsupported on current filesystem
            }
        }
    }

    // ── AES-256-GCM Encryption with Local OS/User Entropy Key ────────────────

    private String encrypt(String plaintext) throws GeneralSecurityException {
        byte[] iv = new byte[GCM_IV_LENGTH];
        SECURE_RANDOM.nextBytes(iv);

        SecretKey key = deriveKey();
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH, iv);
        cipher.init(Cipher.ENCRYPT_MODE, key, spec);

        byte[] cipherText = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
        return Base64.getEncoder().encodeToString(iv) + ":" + Base64.getEncoder().encodeToString(cipherText);
    }

    private String decrypt(String ciphertextBundle) {
        try {
            String[] parts = ciphertextBundle.split(":");
            if (parts.length != 2) return null;

            byte[] iv = Base64.getDecoder().decode(parts[0]);
            byte[] cipherText = Base64.getDecoder().decode(parts[1]);

            SecretKey key = deriveKey();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH, iv);
            cipher.init(Cipher.DECRYPT_MODE, key, spec);

            byte[] plainBytes = cipher.doFinal(cipherText);
            return new String(plainBytes, StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }

    private SecretKey deriveKey() throws GeneralSecurityException {
        String userHome = System.getProperty("user.home", "takeoutfix");
        String userName = System.getProperty("user.name", "operator");
        String osArch = System.getProperty("os.arch", "x86_64");

        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] salt = md.digest(("TakeoutFix-Vault-Salt:" + userHome + ":" + userName).getBytes(StandardCharsets.UTF_8));

        char[] passphrase = ("TKFX-Secure-Storage:" + userName + "@" + osArch).toCharArray();
        PBEKeySpec spec = new PBEKeySpec(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH);
        SecretKeyFactory factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
        byte[] keyBytes = factory.generateSecret(spec).getEncoded();
        return new SecretKeySpec(keyBytes, "AES");
    }
}
