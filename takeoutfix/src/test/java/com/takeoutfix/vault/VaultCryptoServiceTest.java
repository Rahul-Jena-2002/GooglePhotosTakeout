package com.takeoutfix.vault;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.crypto.AEADBadTagException;
import java.io.File;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Vault Cryptographic Engine Unit Tests")
class VaultCryptoServiceTest {

    private final VaultCryptoService cryptoService = new VaultCryptoService();

    @Test
    void testEncryptAndDecryptRoundtrip(@TempDir Path tempDir) throws Exception {
        File sourceFile = tempDir.resolve("original_photo.jpg").toFile();
        String originalContent = "RAW EXIF CAMERA PAYLOAD 2026";
        Files.writeString(sourceFile.toPath(), originalContent, StandardCharsets.UTF_8);

        File vaultFile = tempDir.resolve("secure_photo.tfv").toFile();
        File restoredFile = tempDir.resolve("restored_photo.jpg").toFile();

        char[] password = "MasterSafePassword2026!".toCharArray();

        // 1. Encrypt
        cryptoService.encryptFile(sourceFile, vaultFile, password);
        assertTrue(vaultFile.exists());
        assertTrue(vaultFile.length() > sourceFile.length()); // Header + IV + Tag

        // 2. Decrypt
        cryptoService.decryptFile(vaultFile, restoredFile, password);
        assertTrue(restoredFile.exists());
        String decryptedContent = Files.readString(restoredFile.toPath(), StandardCharsets.UTF_8);
        assertEquals(originalContent, decryptedContent);
    }

    @Test
    void testWrongPasswordFailsDecryption(@TempDir Path tempDir) throws Exception {
        File sourceFile = tempDir.resolve("secret.png").toFile();
        Files.writeString(sourceFile.toPath(), "Private Vault Content", StandardCharsets.UTF_8);

        File vaultFile = tempDir.resolve("secret.tfv").toFile();
        File restoredFile = tempDir.resolve("decrypted.png").toFile();

        cryptoService.encryptFile(sourceFile, vaultFile, "CorrectPassword123".toCharArray());

        // Decrypt with wrong password should fail with AEADBadTagException or security exception
        assertThrows(Exception.class, () -> {
            cryptoService.decryptFile(vaultFile, restoredFile, "WrongPassword456".toCharArray());
        });
        assertFalse(restoredFile.exists());
    }

    @Test
    void testTamperedCiphertextFailsAuthentication(@TempDir Path tempDir) throws Exception {
        File sourceFile = tempDir.resolve("doc.jpg").toFile();
        Files.writeString(sourceFile.toPath(), "Authentic Photo Content", StandardCharsets.UTF_8);

        File vaultFile = tempDir.resolve("doc.tfv").toFile();
        File restoredFile = tempDir.resolve("doc_restored.jpg").toFile();

        char[] password = "Password123!".toCharArray();
        cryptoService.encryptFile(sourceFile, vaultFile, password);

        // Tamper with a byte in the encrypted payload
        try (RandomAccessFile raf = new RandomAccessFile(vaultFile, "rw")) {
            raf.seek(vaultFile.length() - 5);
            byte b = raf.readByte();
            raf.seek(vaultFile.length() - 5);
            raf.writeByte(b ^ 0xFF); // Flip bits
        }

        // Authentication tag check must reject tampered file
        assertThrows(Exception.class, () -> {
            cryptoService.decryptFile(vaultFile, restoredFile, password);
        });
        assertFalse(restoredFile.exists());
    }
}
