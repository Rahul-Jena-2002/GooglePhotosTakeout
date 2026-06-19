import crypto from 'crypto';

const ALGORITHM = "aes-256-gcm";
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;
const IV_LENGTH = 12;

export async function deriveKeyFromPassword(password, salt) {
  const derivedSalt = salt || crypto.randomBytes(SALT_LENGTH);
  const key = crypto.pbkdf2Sync(password, derivedSalt, 100000, 32, 'sha256');
  return { key, salt: derivedSalt };
}

export async function encrypt(plaintext, key) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, encrypted, authTag]);
  const hex = combined.toString('hex');

  return `enc:v1:${hex}`;
}

export async function decrypt(encryptedData, key) {
  if (!encryptedData.startsWith('enc:v1:')) {
    throw new Error('Invalid encrypted data format');
  }

  const hex = encryptedData.slice(7);
  const combined = Buffer.from(hex, 'hex');

  const iv = combined.slice(0, IV_LENGTH);
  const tagStartIndex = combined.length - TAG_LENGTH;
  const encrypted = combined.slice(IV_LENGTH, tagStartIndex);
  const authTag = combined.slice(tagStartIndex);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}

export function hexToBytes(hex) {
  return Buffer.from(hex, 'hex');
}

export function bytesToHex(bytes) {
  return bytes.toString('hex');
}
