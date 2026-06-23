import { state, showToast, closeAllPanels } from './app-state.js';
import { 
  scanFromFile, scanFromScreen, scanFromClipboard 
} from './qr-scanner.js';
import { 
  addAccount 
} from './storage.js';
import { 
  getTranslation 
} from './i18n.js';
import { 
  renderAccounts 
} from './accounts-controller.js';

/* ================================================================
   DOM references (QR Import specific)
   ================================================================ */
const $btnQrScreen    = document.getElementById("btn-qr-screen");
const $btnQrPaste     = document.getElementById("btn-qr-paste");
const $qrFileInput    = document.getElementById("input-qr-file");
const $qrDropzone     = document.getElementById("qr-dropzone");
const $qrPreview      = document.getElementById("qr-preview");
const $qrPreviewList  = document.getElementById("qr-preview-list");
const $btnQrConfirm   = document.getElementById("btn-qr-confirm");
const $btnQrCancel    = document.getElementById("btn-qr-cancel");

const DEFAULT_CATEGORIES = [];

/* ================================================================
   Helpers
   ================================================================ */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export function resetQrPreview() {
  state.pendingQrAccounts = [];
  $qrPreview.classList.add("qr-preview--hidden");
  $qrPreviewList.innerHTML = "";
}

function handleRecognizedAccounts(accountList) {
  state.pendingQrAccounts = accountList;
  $qrPreviewList.innerHTML = "";

  accountList.forEach(acc => {
    const item = document.createElement("div");
    item.className = "qr-preview__detail";
    item.style.marginBottom = "6px";
    item.style.borderBottom = "1px solid var(--border)";
    item.style.paddingBottom = "4px";

    const maskedSecret = acc.secret.slice(0, 6) + "..." + acc.secret.slice(-4);
    const typeStr = acc.type === "hotp" ? `HOTP (ctr: ${acc.counter})` : `TOTP (${acc.period || 30}s)`;
    const algoStr = `${acc.algorithm || "SHA-1"}, ${acc.digits || 6} dig, ${typeStr}`;

    item.innerHTML = `
      <div class="qr-preview__field">
        <span class="qr-preview__name">Service:</span> <strong>${escapeHtml(acc.service)}</strong>
        (${escapeHtml(algoStr)})
      </div>
      <div class="qr-preview__field">
        <span class="qr-preview__name">Login:</span> ${escapeHtml(acc.login)}
      </div>
      <div class="qr-preview__field">
        <span class="qr-preview__name">Secret:</span> <code style="font-size:10px; color:var(--text-secondary);">${escapeHtml(maskedSecret)}</code>
      </div>
    `;
    $qrPreviewList.appendChild(item);
  });
  
  const count = accountList.length;
  const title = document.getElementById("qr-preview-title");
  title.textContent = count === 1 ? getTranslation("qr_preview_title") : `${getTranslation("toast_accounts_found").replace("$1", count)}`;

  $qrPreview.classList.remove("qr-preview--hidden");
  showToast(count === 1 ? "toast_qr_scanned" : getTranslation("toast_accounts_found").replace("$1", count));
}

/* ================================================================
   Initialize Event Listeners
   ================================================================ */
export function initQrController() {
  // 1. File Upload Selector
  $qrFileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) {
      await scanFromFile(file, showToast, handleRecognizedAccounts);
    }
    $qrFileInput.value = "";
  });

  // 2. Scan Screen Capture
  $btnQrScreen.addEventListener("click", async () => {
    await scanFromScreen(showToast);
  });

  // 3. Paste Clipboard Image click trigger
  $btnQrPaste.addEventListener("click", async () => {
    await scanFromClipboard(showToast, handleRecognizedAccounts);
  });

  // 4. Ctrl+V Event Handler for window
  document.addEventListener("paste", async (e) => {
    if (!state.qrOpen) return;
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.indexOf("image") !== -1) {
        const file = item.getAsFile();
        await scanFromFile(file, showToast, handleRecognizedAccounts);
        break;
      }
    }
  });

  // 5. Confirm QR code imports
  $btnQrConfirm.addEventListener("click", async () => {
    if (state.pendingQrAccounts.length === 0) return;

    try {
      for (const acc of state.pendingQrAccounts) {
        await addAccount(
          acc.service,
          acc.login,
          acc.secret,
          acc.period,
          acc.digits,
          acc.algorithm,
          acc.type || "totp",
          acc.counter || 0,
          "none"
        );
      }
      showToast(state.pendingQrAccounts.length === 1 ? "toast_imported_qr" : getTranslation("toast_imported_count").replace("$1", state.pendingQrAccounts.length));
      closeAllPanels();
      await renderAccounts();
    } catch (err) {
      console.error(err);
      showToast("toast_save_error_multi", "error");
    }
  });

  // 6. Cancel QR Code imports
  $btnQrCancel.addEventListener("click", () => {
    resetQrPreview();
    showToast("toast_import_cancelled");
  });
}
