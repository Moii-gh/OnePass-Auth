/**
 * crypto.js – AES-GCM encryption / decryption via Web Crypto API.
 *
 * Support for cryptographic locking of the encryption key with a user PIN using PBKDF2.
 */

const CRYPTO_KEY_STORAGE = "__enc_key";

let inMemoryKey = null;

/**
 * Clear in-memory key (e.g. on lock)
 */
export function clearInMemoryKey() {
  inMemoryKey = null;
  chrome.storage.session.remove("__session_enc_key");
}

/**
 * Check if the key is locked
 */
export async function isLocked() {
  if (inMemoryKey) return false;

  // Check if session storage has the unlocked key
  const sessionData = await new Promise((resolve) =>
    chrome.storage.session.get("__session_enc_key", resolve)
  );
  if (sessionData && sessionData["__session_enc_key"]) {
    const rawBytes = new Uint8Array(sessionData["__session_enc_key"]);
    inMemoryKey = await crypto.subtle.importKey("raw", rawBytes, "AES-GCM", true, [
      "encrypt",
      "decrypt",
    ]);
    return false;
  }

  const storedData = await new Promise((resolve) =>
    chrome.storage.local.get("__enc_key_locked", resolve)
  );
  return !!storedData["__enc_key_locked"];
}

/**
 * Check if a PIN is set at all
 */
export async function hasPinSet() {
  const storedData = await new Promise((resolve) =>
    chrome.storage.local.get("__enc_key_locked", resolve)
  );
  return !!storedData["__enc_key_locked"];
}

/**
 * Unlock the key using the user's PIN
 */
export async function unlockKey(pin) {
  const storedData = await new Promise((resolve) =>
    chrome.storage.local.get(["__enc_key_locked", "__enc_key_salt", "__enc_key_iv"], resolve)
  );

  if (!storedData["__enc_key_locked"]) {
    throw new Error("No PIN set");
  }

  const lockedBytes = new Uint8Array(storedData["__enc_key_locked"]);
  const saltBytes = new Uint8Array(storedData["__enc_key_salt"]);
  const ivBytes = new Uint8Array(storedData["__enc_key_iv"]);

  const pKey = await deriveKeyFromPin(pin, saltBytes);
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes },
    pKey,
    lockedBytes
  );

  const rawBytes = new Uint8Array(decryptedBuffer);
  inMemoryKey = await crypto.subtle.importKey("raw", rawBytes, "AES-GCM", true, [
    "encrypt",
    "decrypt",
  ]);

  // Save the master key to session storage to persist across contexts/popups
  await new Promise((resolve) =>
    chrome.storage.session.set({ __session_enc_key: Array.from(rawBytes) }, resolve)
  );

  return true;
}

/**
 * Setup a new PIN and encrypt the master key with it
 */
export async function setupPin(pin) {
  const key = await getEncryptionKey();
  const rawBytes = new Uint8Array(await crypto.subtle.exportKey("raw", key));

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const pKey = await deriveKeyFromPin(pin, salt);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    pKey,
    rawBytes
  );

  await new Promise((resolve) =>
    chrome.storage.local.set(
      {
        __enc_key_locked: Array.from(new Uint8Array(cipherBuffer)),
        __enc_key_salt: Array.from(salt),
        __enc_key_iv: Array.from(iv)
      },
      resolve
    )
  );

  // Remove plaintext key from storage
  await new Promise((resolve) =>
    chrome.storage.local.remove(CRYPTO_KEY_STORAGE, resolve)
  );

  inMemoryKey = key;

  // Save the master key to session storage to persist across contexts/popups
  await new Promise((resolve) =>
    chrome.storage.session.set({ __session_enc_key: Array.from(rawBytes) }, resolve)
  );
}

/**
 * Remove the PIN lock and restore the master key to plaintext storage
 */
export async function removePin(pin) {
  await unlockKey(pin);

  const rawBytes = new Uint8Array(await crypto.subtle.exportKey("raw", inMemoryKey));

  await new Promise((resolve) =>
    chrome.storage.local.set(
      { [CRYPTO_KEY_STORAGE]: Array.from(rawBytes) },
      resolve
    )
  );

  await new Promise((resolve) =>
    chrome.storage.local.remove(["__enc_key_locked", "__enc_key_salt", "__enc_key_iv"], resolve)
  );

  // Clear session storage as it is no longer locked
  await new Promise((resolve) =>
    chrome.storage.session.remove("__session_enc_key", resolve)
  );
}

/**
 * Derive an AES key from a PIN using PBKDF2
 */
async function deriveKeyFromPin(pin, saltBytes) {
  const pinBuffer = new TextEncoder().encode(pin);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    pinBuffer,
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 100000,
      hash: "SHA-256"
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Return (or create) the AES-GCM CryptoKey.
 */
export async function getEncryptionKey() {
  if (inMemoryKey) {
    return inMemoryKey;
  }

  // Try checking session storage first
  const sessionData = await new Promise((resolve) =>
    chrome.storage.session.get("__session_enc_key", resolve)
  );
  if (sessionData && sessionData["__session_enc_key"]) {
    const rawBytes = new Uint8Array(sessionData["__session_enc_key"]);
    inMemoryKey = await crypto.subtle.importKey("raw", rawBytes, "AES-GCM", true, [
      "encrypt",
      "decrypt",
    ]);
    return inMemoryKey;
  }

  const storedData = await new Promise((resolve) =>
    chrome.storage.local.get([CRYPTO_KEY_STORAGE, "__enc_key_locked"], resolve)
  );

  if (storedData["__enc_key_locked"]) {
    throw new Error("Key is locked");
  }

  if (storedData[CRYPTO_KEY_STORAGE]) {
    const rawBytes = new Uint8Array(storedData[CRYPTO_KEY_STORAGE]);
    inMemoryKey = await crypto.subtle.importKey("raw", rawBytes, "AES-GCM", true, [
      "encrypt",
      "decrypt",
    ]);
    return inMemoryKey;
  }

  // First launch – generate a new 256-bit key
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const exported = await crypto.subtle.exportKey("raw", key);
  await new Promise((resolve) =>
    chrome.storage.local.set(
      { [CRYPTO_KEY_STORAGE]: Array.from(new Uint8Array(exported)) },
      resolve
    )
  );

  inMemoryKey = key;
  return key;
}

/**
 * Encrypt a plaintext string.
 */
export async function encryptSecret(plaintext) {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );

  return {
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(cipherBuffer)),
  };
}

/**
 * Decrypt a ciphertext object produced by encryptSecret().
 */
export async function decryptSecret(encryptedObj) {
  const key = await getEncryptionKey();
  const iv = new Uint8Array(encryptedObj.iv);
  const data = new Uint8Array(encryptedObj.data);

  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  return new TextDecoder().decode(plainBuffer);
}

