/**
 * storage.js – CRUD for accounts using chrome.storage.local / sync.
 */

import { encryptSecret, decryptSecret } from './crypto.js';

const ACCOUNTS_KEY = "accounts";

/**
 * Load all accounts from sync storage. If empty, checks local storage for migration.
 */
export async function loadAccounts() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(ACCOUNTS_KEY, async (syncResult) => {
      const syncAccounts = syncResult[ACCOUNTS_KEY];
      
      if (syncAccounts) {
        resolve(syncAccounts);
      } else {
        // Checking local storage for migration if sync storage is empty
        chrome.storage.local.get(ACCOUNTS_KEY, async (localResult) => {
          const localAccounts = localResult[ACCOUNTS_KEY] || [];
          if (localAccounts.length > 0) {
            // Save to sync storage
            await saveAccounts(localAccounts);
            // Clear local storage for clean state
            chrome.storage.local.remove(ACCOUNTS_KEY);
            console.log("Accounts migrated from local storage to sync storage.");
          }
          resolve(localAccounts);
        });
      }
    });
  });
}

/**
 * Save full accounts array to sync storage.
 */
export async function saveAccounts(accounts) {
  return new Promise((resolve) =>
    chrome.storage.sync.set({ [ACCOUNTS_KEY]: accounts }, resolve)
  );
}

/**
 * Add a new account. The secret is encrypted before saving.
 */
export async function addAccount(service, login, secretPlain, period = 30, digits = 6, algorithm = "SHA-1", type = "totp", counter = 0, category = "none") {
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
    counter,
    category
  });
  await saveAccounts(accounts);
}

/**
 * Update an existing account details.
 */
export async function updateAccount(id, service, login, secretPlain, period = 30, digits = 6, algorithm = "SHA-1", type = "totp", counter = 0, category = "none") {
  const accounts = await loadAccounts();
  const index = accounts.findIndex(a => a.id === id);
  if (index !== -1) {
    let encrypted = accounts[index].secret;
    if (secretPlain) {
      encrypted = await encryptSecret(secretPlain);
    }
    accounts[index] = {
      id,
      service,
      login,
      secret: encrypted,
      period,
      digits,
      algorithm,
      type,
      counter,
      category
    };
    await saveAccounts(accounts);
  }
}

/**
 * Increment HOTP counter for an account.
 */
export async function incrementCounter(id) {
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
export async function removeAccount(id) {
  let accounts = await loadAccounts();
  accounts = accounts.filter((a) => a.id !== id);
  await saveAccounts(accounts);
}

