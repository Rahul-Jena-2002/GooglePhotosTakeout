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
import java.io.IOException;
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
 *     * Fallback: AES-256-GCM vault (.credentials.enc) using a locally derived, predictable key
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

    private final File configDir;
    private final File sessionMetadataFile;
    private final File encryptedCredentialsFile;

    private static final String SERVICE_NAME = "TakeoutFix";
    private static final String KEY_EMAIL = "email";
    private static final String KEY_REFRESH_TOKEN = "refreshToken";
    private static final String KEY_ID_TOKEN = "idToken";

    private static final int GCM_TAG_LENGTH = 128;
    private static final int GCM_IV_LENGTH = 12;
    private static final int PBKDF2_ITERATIONS = 65_536;
    private static final int KEY_LENGTH = 256;

    public CredentialStore() {
        this(new File(System.getProperty("user.home"), ".takeoutfix"));
    }

    public CredentialStore(File configDir) {
        this.configDir = configDir != null ? configDir : new File(System.getProperty("user.home"), ".takeoutfix");
        this.sessionMetadataFile = new File(this.configDir, "session.json");
        this.encryptedCredentialsFile = new File(this.configDir, ".credentials.enc");
        if (!this.configDir.exists()) {
            this.configDir.mkdirs();
        }
    }

    public File getConfigDir() {
        return configDir;
    }

    /**
     * Loads session credentials. Reads metadata from session.json and tokens from OS Keyring.
     */
    public synchronized AuthSession loadSession() {
        try {
            if (!sessionMetadataFile.exists()) {
                return null;
            }

            String metaContent = Files.readString(sessionMetadataFile.toPath(), StandardCharsets.UTF_8);
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

            JSONObject securePayload = loadTokensFromSecureStore(email, meta.optString("tokenStorage", ""));
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
            if (!configDir.exists()) {
                configDir.mkdirs();
            }

            // 1. Securely store tokens in OS Keyring / Encrypted Vault
            StorageTier storageTier = saveTokensToSecureStore(session.getEmail(), session.getRefreshToken(), session.getIdToken());

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
            meta.put("tokenStorage", storageTier.name());

            writeAtomically(sessionMetadataFile.toPath(), meta.toString(2));
            if (storageTier == StorageTier.OS_KEYRING) {
                try {
                    Files.deleteIfExists(encryptedCredentialsFile.toPath());
                } catch (Exception e) {
                    log.warn("[CredentialStore] Could not remove legacy credential backup: {}", e.getMessage());
                }
            }

        } catch (Exception e) {
            log.error("[CredentialStore] Failed to save credentials", e);
            throw new IllegalStateException("Could not save sign-in information on this device.", e);
        }
    }

    /**
     * Wipes credentials completely from OS Keyring, encrypted vault, and session.json.
     * Each step is isolated so that failure in one does not abort the remaining cleanup steps.
     */
    public synchronized boolean clear() {
        boolean cleared = true;
        // 1. Extract email BEFORE deleting the metadata file
        String accountEmail = null;
        if (sessionMetadataFile.exists()) {
            try {
                String metaContent = Files.readString(sessionMetadataFile.toPath(), StandardCharsets.UTF_8);
                if (metaContent != null && !metaContent.isBlank()) {
                    JSONObject meta = new JSONObject(metaContent);
                    accountEmail = meta.optString(KEY_EMAIL, null);
                }
                if (accountEmail == null || accountEmail.isBlank()) {
                    cleared = false;
                    log.warn("[CredentialStore] Session metadata has no account email; keyring cleanup cannot be verified.");
                }
            } catch (Exception e) {
                cleared = false;
                log.warn("[CredentialStore] Failed reading session metadata during clear(): {}", e.getMessage());
            }
        }

        // 2. Delete from OS Keyring (Isolated try-catch, explicit logging, non-aborting)
        if (accountEmail != null && !accountEmail.isBlank()) {
            try (Keyring keyring = Keyring.create()) {
                keyring.deletePassword(SERVICE_NAME, accountEmail);
                log.info("[CredentialStore] Cleared credentials from OS Keyring for {}", accountEmail);
            } catch (Exception e) {
                cleared = false;
                log.error("[CredentialStore] Failed to remove credentials from OS Keyring for {}: {}", accountEmail, e.getMessage(), e);
            }
        }

        // 3. Delete encrypted fallback vault (Isolated try-catch)
        if (encryptedCredentialsFile.exists()) {
            try {
                Files.deleteIfExists(encryptedCredentialsFile.toPath());
            } catch (Exception e) {
                cleared = false;
                log.error("[CredentialStore] Failed to delete encrypted credentials vault file: {}", e.getMessage(), e);
            }
        }

        // 4. Delete session metadata file (Isolated try-catch, guaranteed to run)
        if (sessionMetadataFile.exists()) {
            try {
                Files.deleteIfExists(sessionMetadataFile.toPath());
            } catch (Exception e) {
                cleared = false;
                log.error("[CredentialStore] Failed to delete session.json: {}", e.getMessage(), e);
            }
        }
        return cleared;
    }

    public synchronized boolean hasStoredCredential() {
        if (!sessionMetadataFile.exists()) {
            return false;
        }
        try {
            String metaContent = Files.readString(sessionMetadataFile.toPath(), StandardCharsets.UTF_8);
            if (metaContent == null || metaContent.isBlank()) {
                return false;
            }
            JSONObject meta = new JSONObject(metaContent);
            String email = meta.optString(KEY_EMAIL, "");
            if (email.isBlank()) {
                return false;
            }

            JSONObject tokens = loadTokensFromSecureStore(email, meta.optString("tokenStorage", ""));
            if (tokens != null && !tokens.optString(KEY_REFRESH_TOKEN, "").isBlank()) return true;
            return !meta.optString(KEY_REFRESH_TOKEN, "").isBlank();
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Determines which storage tier is currently safeguarding credentials for the given account.
     */
    public StorageTier getStorageTier(String account) {
        String declaredTier = "";
        try {
            if (sessionMetadataFile.exists()) {
                JSONObject meta = new JSONObject(Files.readString(sessionMetadataFile.toPath(), StandardCharsets.UTF_8));
                if (meta.optString(KEY_EMAIL, "").equalsIgnoreCase(account)) {
                    declaredTier = meta.optString("tokenStorage", "");
                }
            }
        } catch (Exception e) {
            log.warn("[CredentialStore] Could not read credential storage metadata: {}", e.getMessage());
        }
        if (StorageTier.ENCRYPTED_VAULT_FALLBACK.name().equals(declaredTier)) {
            return encryptedCredentialsFile.exists() ? StorageTier.ENCRYPTED_VAULT_FALLBACK : StorageTier.NONE;
        }
        if (account != null && !account.isBlank() && isKeyringUsable()) {
            try (Keyring keyring = Keyring.create()) {
                String secret = keyring.getPassword(SERVICE_NAME, account);
                if (secret != null && !secret.isBlank()) {
                    return StorageTier.OS_KEYRING;
                }
            } catch (Exception ignored) {
                markKeyringUnavailable(ignored);
            }
        }
        if (!StorageTier.OS_KEYRING.name().equals(declaredTier) && encryptedCredentialsFile.exists()) {
            return StorageTier.ENCRYPTED_VAULT_FALLBACK;
        }
        return StorageTier.NONE;
    }

    private static final java.util.concurrent.atomic.AtomicBoolean KEYRING_AVAILABLE = new java.util.concurrent.atomic.AtomicBoolean(true);
    private static final java.util.concurrent.atomic.AtomicBoolean KEYRING_LOGGED = new java.util.concurrent.atomic.AtomicBoolean(false);

    private static boolean isKeyringUsable() {
        return KEYRING_AVAILABLE.get();
    }

    private static void markKeyringUnavailable(Throwable t) {
        KEYRING_AVAILABLE.set(false);
        if (KEYRING_LOGGED.compareAndSet(false, true)) {
            log.warn("[CredentialStore] OS keyring unavailable ({}); legacy fallback uses a predictable local key.",
                    t != null ? t.getMessage() : "unsupported");
        }
    }

    static void resetKeyringAvailability() {
        KEYRING_AVAILABLE.set(true);
    }

    // ── OS Keyring & Authenticated AES-GCM Storage ───────────────────────────

    private StorageTier saveTokensToSecureStore(String account, String refreshToken, String idToken) throws IOException {
        JSONObject payload = new JSONObject();
        payload.put(KEY_REFRESH_TOKEN, refreshToken != null ? refreshToken : "");
        payload.put(KEY_ID_TOKEN, idToken != null ? idToken : "");
        payload.put("savedAt", System.currentTimeMillis());

        String serialized = payload.toString();

        if (saveToKeyring(account, serialized)) {
            return StorageTier.OS_KEYRING;
        }
        if (!saveEncryptedBackup(serialized)) throw new IOException("No credential store could save the session.");
        return StorageTier.ENCRYPTED_VAULT_FALLBACK;
    }

    boolean saveToKeyring(String account, String serialized) {
        if (isKeyringUsable()) {
            try (Keyring keyring = Keyring.create()) {
                keyring.setPassword(SERVICE_NAME, account, serialized);
                boolean verified = serialized.equals(keyring.getPassword(SERVICE_NAME, account));
                if (!verified) log.warn("[CredentialStore] OS keyring write could not be verified.");
                return verified;
            } catch (Exception t) {
                markKeyringUnavailable(t);
            }
        }
        return false;
    }

    private JSONObject loadTokensFromSecureStore(String account, String storageTier) {
        if (StorageTier.ENCRYPTED_VAULT_FALLBACK.name().equals(storageTier)) return loadEncryptedBackup();
        JSONObject keyring = loadFromKeyring(account);
        if (keyring != null || StorageTier.OS_KEYRING.name().equals(storageTier)) return keyring;
        return loadEncryptedBackup();
    }

    JSONObject loadFromKeyring(String account) {
        if (isKeyringUsable()) {
            try (Keyring keyring = Keyring.create()) {
                String secret = keyring.getPassword(SERVICE_NAME, account);
                if (secret != null && !secret.isBlank()) {
                    return new JSONObject(secret);
                }
            } catch (Exception t) {
                markKeyringUnavailable(t);
            }
        }

        return null;
    }

    private JSONObject loadEncryptedBackup() {
        if (encryptedCredentialsFile.exists()) {
            try {
                String encContent = Files.readString(encryptedCredentialsFile.toPath(), StandardCharsets.UTF_8);
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

    private boolean saveEncryptedBackup(String serialized) {
        try {
            String encrypted = encrypt(serialized);
            writeAtomically(encryptedCredentialsFile.toPath(), encrypted);
            restrictPosixPermissions();
            return true;
        } catch (Exception e) {
            log.error("[CredentialStore] Failed to write encrypted credential backup", e);
            return false;
        }
    }

    static void writeAtomically(java.nio.file.Path destination, String contents) throws IOException {
        java.nio.file.Path target = destination.toAbsolutePath();
        java.nio.file.Path temporary = Files.createTempFile(target.getParent(), ".takeoutfix-", ".tmp");
        try {
            Files.writeString(temporary, contents, StandardCharsets.UTF_8);
            try {
                Files.move(temporary, target, java.nio.file.StandardCopyOption.ATOMIC_MOVE,
                        java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            } catch (java.nio.file.AtomicMoveNotSupportedException e) {
                Files.move(temporary, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException | RuntimeException e) {
            try { Files.deleteIfExists(temporary); }
            catch (IOException cleanupError) { e.addSuppressed(cleanupError); }
            throw e;
        }
    }

    private void restrictPosixPermissions() {
        if (!System.getProperty("os.name", "").toLowerCase().contains("win")) {
            try {
                Files.setPosixFilePermissions(encryptedCredentialsFile.toPath(),
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
