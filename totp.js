/**
 * totp.js – TOTP code generation per RFC 6238 (HMAC-SHA1, 30 s, 6 digits by default).
 *
 * Uses Web Crypto API for HMAC; no external libraries required.
 */

const DEFAULT_TOTP_PERIOD = 30; // seconds
const DEFAULT_TOTP_DIGITS = 6;
const DEFAULT_TOTP_ALGO   = "SHA-1";

/* ------------------------------------------------------------------ */
/*  Base32 helpers                                                     */
/* ------------------------------------------------------------------ */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Validate that a string is legal Base32 (RFC 4648).
 */
function isValidBase32(str) {
  if (!str || str.length === 0) return false;
  const cleaned = str.replace(/[\s=-]/g, "").toUpperCase();
  return /^[A-Z2-7]+$/.test(cleaned);
}

/**
 * Decode a Base32 string into a Uint8Array.
 */
function base32ToBytes(base32) {
  const cleaned = base32.replace(/[\s=-]/g, "").toUpperCase();
  let bits = "";
  for (const ch of cleaned) {
    const val = BASE32_ALPHABET.indexOf(ch);
    if (val === -1) throw new Error("Invalid Base32 character: " + ch);
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

/* ------------------------------------------------------------------ */
/*  TOTP core                                                          */
/* ------------------------------------------------------------------ */

/**
 * Generate the current TOTP code for a given secret (plaintext Base32).
 * @param {string} secretBase32 – the raw Base32-encoded secret
 * @param {number} period – update period in seconds
 * @param {number} digits – code length
 * @param {string} algorithm – HMAC hash algorithm (SHA-1, SHA-256, SHA-512)
 * @returns {Promise<string>} digits-digit zero-padded code
 */
async function generateTOTP(secretBase32, period = DEFAULT_TOTP_PERIOD, digits = DEFAULT_TOTP_DIGITS, algorithm = DEFAULT_TOTP_ALGO) {
  const keyBytes = base32ToBytes(secretBase32);
  const epoch = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / period);

  // Convert counter to 8-byte big-endian buffer
  const counterBuf = new ArrayBuffer(8);
  const view = new DataView(counterBuf);
  // Write counter as 64-bit integer
  // JavaScript numbers are double precision floats, safe up to 2^53 - 1
  const high = Math.floor(counter / 0x100000000);
  const low = counter % 0x100000000;
  view.setUint32(0, high, false);
  view.setUint32(4, low, false);

  // Normalize Web Crypto algorithm hash format (e.g. SHA1 -> SHA-1)
  let hashName = algorithm.toUpperCase();
  if (hashName === "SHA1") hashName = "SHA-1";
  if (hashName === "SHA256") hashName = "SHA-256";
  if (hashName === "SHA512") hashName = "SHA-512";

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: hashName },
    false,
    ["sign"]
  );
  const hmac = new Uint8Array(
    await crypto.subtle.sign("HMAC", cryptoKey, counterBuf)
  );

  // Dynamic truncation (RFC 4226 §5.4)
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, "0");
}

/**
 * Seconds remaining until the next TOTP refresh.
 * @param {number} period
 */
function secondsRemaining(period = DEFAULT_TOTP_PERIOD) {
  return period - (Math.floor(Date.now() / 1000) % period);
}
