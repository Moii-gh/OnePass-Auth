/**
 * crypto.js – AES-GCM encryption / decryption via Web Crypto API.
 *
 * The encryption key is generated once and persisted in chrome.storage.local
 * under the key "__enc_key". IV is stored alongside every ciphertext.
 */

const CRYPTO_KEY_STORAGE = "__enc_key";

/**
 * Return (or create) the AES-GCM CryptoKey.
 * The raw key bytes are exported and stored as a JSON-safe array so they
 * survive browser restarts.
 */
async function getEncryptionKey() {
  const stored = await new Promise((resolve) =>
    chrome.storage.local.get(CRYPTO_KEY_STORAGE, (r) =>
      resolve(r[CRYPTO_KEY_STORAGE])
    )
  );

  if (stored) {
    const rawBytes = new Uint8Array(stored);
    return crypto.subtle.importKey("raw", rawBytes, "AES-GCM", true, [
      "encrypt",
      "decrypt",
    ]);
  }

  // First launch – generate a new 256-bit key
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // extractable so we can persist it
    ["encrypt", "decrypt"]
  );

  const exported = await crypto.subtle.exportKey("raw", key);
  await new Promise((resolve) =>
    chrome.storage.local.set(
      { [CRYPTO_KEY_STORAGE]: Array.from(new Uint8Array(exported)) },
      resolve
    )
  );

  return key;
}

/**
 * Encrypt a plaintext string.
 * @returns {{ iv: number[], data: number[] }}
 */
async function encryptSecret(plaintext) {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
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
 * @returns {string} plaintext
 */
async function decryptSecret(encryptedObj) {
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
