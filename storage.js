/**
 * storage.js – CRUD for accounts using chrome.storage.local.
 *
 * Each account is stored as:
 * {
 *   id:      string,   // unique id (timestamp-based)
 *   service: string,   // service name
 *   login:   string,   // username / email
 *   secret:  { iv: number[], data: number[] }  // encrypted secret
 * }
 *
 * All accounts are kept under the storage key "accounts" as an array.
 */

const ACCOUNTS_KEY = "accounts";

/**
 * Load all accounts from storage.
 * @returns {Promise<Array>}
 */
async function loadAccounts() {
  return new Promise((resolve) =>
    chrome.storage.local.get(ACCOUNTS_KEY, (result) =>
      resolve(result[ACCOUNTS_KEY] || [])
    )
  );
}

/**
 * Save full accounts array to storage.
 */
async function saveAccounts(accounts) {
  return new Promise((resolve) =>
    chrome.storage.local.set({ [ACCOUNTS_KEY]: accounts }, resolve)
  );
}

/**
 * Add a new account. The secret is encrypted before saving.
 * @param {string} service
 * @param {string} login
 * @param {string} secretPlain – Base32 secret (plaintext)
 * @param {number} period
 * @param {number} digits
 * @param {string} algorithm
 * @param {string} type – "totp" or "hotp"
 * @param {number} counter – initial counter value for HOTP
 */
async function addAccount(service, login, secretPlain, period = 30, digits = 6, algorithm = "SHA-1", type = "totp", counter = 0) {
  const encrypted = await encryptSecret(secretPlain);
  const accounts = await loadAccounts();
  accounts.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    service,
    login,
    secret: encrypted,
    period,
    digits,
    algorithm,
    type,
    counter
  });
  await saveAccounts(accounts);
}

/**
 * Increment HOTP counter for an account.
 * @param {string} id
 * @returns {Promise<number|null>} new counter value, or null if account not found
 */
async function incrementCounter(id) {
  const accounts = await loadAccounts();
  const index = accounts.findIndex(a => a.id === id);
  if (index !== -1) {
    accounts[index].counter = (accounts[index].counter || 0) + 1;
    await saveAccounts(accounts);
    return accounts[index].counter;
  }
  return null;
}

/**
 * Remove an account by its id.
 */
async function removeAccount(id) {
  let accounts = await loadAccounts();
  accounts = accounts.filter((a) => a.id !== id);
  await saveAccounts(accounts);
}
