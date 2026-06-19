const ALGORITHM = "AES-GCM";
const SALT_LENGTH = 16;
const TAG_LENGTH = 128;
const IV_LENGTH = 12;

export async function deriveKeyFromPassword(
  password: string,
  salt?: Uint8Array
): Promise<{ key: CryptoKey; salt: Uint8Array }> {
  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordData,
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  const derivedSalt = salt || crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: derivedSalt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: ALGORITHM, length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  return { key, salt: derivedSalt };
}

export async function encrypt(
  plaintext: string,
  key: CryptoKey
): Promise<string> {
  const encoder = new TextEncoder();
  const plaintextData = encoder.encode(plaintext);

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    key,
    plaintextData
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  const hex = Array.from(combined)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `enc:v1:${hex}`;
}

export async function decrypt(
  encryptedData: string,
  key: CryptoKey
): Promise<string> {
  if (!encryptedData.startsWith("enc:v1:")) {
    throw new Error("Invalid encrypted data format");
  }

  const hex = encryptedData.slice(7);
  const combined = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    combined[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }

  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    key,
    ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(plaintext);
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
