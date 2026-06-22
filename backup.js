/**
 * backup.js – Handles data backup export and import logic with duplicate detection.
 */

import { loadAccounts, addAccount } from './storage.js';
import { decryptSecret } from './crypto.js';
import { isValidBase32 } from './totp.js';
import { getTranslation } from './i18n.js';

export async function exportBackup(toastFn) {
  try {
    const accounts = await loadAccounts();
    const decryptedAccounts = [];
    
    for (const acc of accounts) {
      try {
        const plainSecret = await decryptSecret(acc.secret);
        decryptedAccounts.push({
          service: acc.service,
          login: acc.login,
          secret: plainSecret,
          period: acc.period || 30,
          digits: acc.digits || 6,
          algorithm: acc.algorithm || "SHA-1",
          type: acc.type || "totp",
          counter: acc.counter || 0,
          category: acc.category || "none"
        });
      } catch (err) {
        console.error("Failed to decrypt account during backup export:", acc.service, err);
      }
    }

    const backupData = {
      source: "OnePass Auth Backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      accounts: decryptedAccounts
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `onepass_auth_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toastFn(getTranslation("toast_backup_downloaded"), "success");
  } catch (err) {
    console.error("Backup export error:", err);
    toastFn(getTranslation("toast_backup_export_error"), "error");
  }
}

export function importBackup(file, toastFn, renderAccountsFn) {
  if (!file) return;

  try {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.source !== "OnePass Auth Backup" || !Array.isArray(data.accounts)) {
          toastFn(getTranslation("toast_backup_invalid"), "error");
          return;
        }

        const currentAccounts = await loadAccounts();
        const currentPlainList = [];
        
        for (const acc of currentAccounts) {
          try {
            const plain = await decryptSecret(acc.secret);
            currentPlainList.push({ service: acc.service, login: acc.login, secret: plain });
          } catch (err) {}
        }

        let importedCount = 0;
        let skippedCount = 0;

        for (const acc of data.accounts) {
          if (!acc.service || !acc.login || !acc.secret) {
            skippedCount++;
            continue;
          }

          if (!isValidBase32(acc.secret)) {
            skippedCount++;
            continue;
          }

          const isDuplicate = currentPlainList.some(curr => 
            curr.service.toLowerCase() === acc.service.toLowerCase() &&
            curr.login.toLowerCase() === acc.login.toLowerCase() &&
            curr.secret === acc.secret
          );

          if (isDuplicate) {
            skippedCount++;
            continue;
          }

          await addAccount(
            acc.service,
            acc.login,
            acc.secret,
            acc.period || 30,
            acc.digits || 6,
            acc.algorithm || "SHA-1",
            acc.type || "totp",
            acc.counter || 0,
            acc.category || "none"
          );
          importedCount++;
        }

        if (importedCount > 0) {
          toastFn(getTranslation("toast_imported_backup_count", importedCount), "success");
          await renderAccountsFn();
        } else {
          toastFn(getTranslation("toast_backup_all_added"), "success");
        }
      } catch (err) {
        console.error("Failed to parse JSON backup:", err);
        toastFn(getTranslation("toast_file_read_error"), "error");
      }
    };
    reader.readAsText(file);
  } catch (err) {
    console.error("Backup import file error:", err);
    toastFn(getTranslation("toast_file_import_error"), "error");
  }
}
