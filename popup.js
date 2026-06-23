/**
 * popup.js – Main modular controller for OnePass Auth extension.
 */

import { 
  decryptSecret, encryptSecret, isLocked, unlockKey, setupPin, removePin, clearInMemoryKey, hasPinSet 
} from './crypto.js';
import { 
  generateTOTP, generateHOTP, secondsRemaining 
} from './totp.js';
import { 
  loadAccounts, addAccount, updateAccount, incrementCounter, removeAccount,
  loadCustomCategories, addCustomCategory, removeCustomCategory
} from './storage.js';
import { 
  parseOtpauthUrl 
} from './qr.js';
import { 
  isValidBase32 
} from './totp.js';
import { 
  initTranslations, getTranslation, setLanguage
} from './i18n.js';
import { 
  initDragAndDrop, startReorderMode 
} from './drag-drop.js';
import { 
  exportBackup, importBackup 
} from './backup.js';
import { 
  scanFromFile, scanFromScreen, scanFromClipboard 
} from './qr-scanner.js';
import { 
  applyAccentColor, applyThemeMode, startHorizontalScroll, stopHorizontalScroll 
} from './ui.js';

/* ================================================================
   DOM references
   ================================================================ */
const $toggleForm = document.getElementById("btn-toggle-form");
const $toggleQr   = document.getElementById("btn-toggle-qr");
const $addForm    = document.getElementById("add-form");
const $addFormTitle = document.getElementById("add-form-title");
const $qrPanel    = document.getElementById("qr-panel");
const $accounts   = document.getElementById("accounts");
const $empty      = document.getElementById("empty-state");
const $toast      = document.getElementById("toast");

// Manual form inputs
const $inputSvc      = document.getElementById("input-service");
const $inputLogin    = document.getElementById("input-login");
const $inputKey      = document.getElementById("input-secret");
const $selectCategory = document.getElementById("select-category");
const $btnSave       = document.getElementById("btn-save");

// Form state
let manualAccountType = "totp";
let manualAccountCounter = 0;
let editingId = null; // tracking edit mode

// QR panel components
const $btnQrScreen  = document.getElementById("btn-qr-screen");
const $btnQrPaste   = document.getElementById("btn-qr-paste");
const $qrFileInput  = document.getElementById("input-qr-file");
const $qrDropzone   = document.getElementById("qr-dropzone");
const $qrPreview    = document.getElementById("qr-preview");
const $qrPreviewList = document.getElementById("qr-preview-list");
const $btnQrConfirm = document.getElementById("btn-qr-confirm");
const $btnQrCancel  = document.getElementById("btn-qr-cancel");

// Context menu references
const $contextMenu = document.getElementById("context-menu");
const $ctxCopy     = document.getElementById("ctx-copy");
const $ctxEdit     = document.getElementById("ctx-edit");
const $ctxMove     = document.getElementById("ctx-move");
const $ctxQr       = document.getElementById("ctx-qr");
const $ctxDelete   = document.getElementById("ctx-delete");
let activeCardId   = null;

// QR Modal references
const $qrModal          = document.getElementById("qr-modal");
const $qrModalTitle     = document.getElementById("qr-modal-title");
const $qrModalCode      = document.getElementById("qr-modal-code");
const $btnQrModalClose  = document.getElementById("btn-qr-modal-close");

// Settings panel references
const $toggleSettings = document.getElementById("btn-toggle-settings");
const $settingsPanel  = document.getElementById("settings-panel");
const $btnSettingsBack = document.getElementById("btn-settings-back");
const $colorDots      = document.querySelectorAll(".color-dot");
const $settingThemeMode = document.getElementById("setting-theme-mode");
const $settingLanguage = document.getElementById("setting-language");
const $settingPrivacy = document.getElementById("setting-privacy");
const $settingPinLock = document.getElementById("setting-pin-lock");
const $settingClearClipboard = document.getElementById("setting-clear-clipboard");
const $btnBackupExport = document.getElementById("btn-backup-export");
const $btnBackupImportTrigger = document.getElementById("btn-backup-import-trigger");
const $inputBackupFile = document.getElementById("input-backup-file");

// Search elements references
const $inputSearch    = document.getElementById("input-search");
const $btnSearchClear = document.getElementById("btn-search-clear");

// Categories chips references
const $categoriesWrapper = document.getElementById("categories-wrapper");

// Inline category creator references
const $newCatInlineContainer = document.getElementById("add-form-new-cat-container");
const $inputNewCatInline = document.getElementById("input-new-cat-inline");
const $btnSaveNewCatInline = document.getElementById("btn-save-new-cat-inline");
const $btnCancelNewCatInline = document.getElementById("btn-cancel-new-cat-inline");

let currentCategory = "all";

const DEFAULT_CATEGORIES = [];

// Lock screen overlays
const $lockScreen = document.getElementById("lock-screen");
const $pinSetupOverlay = document.getElementById("pin-setup-overlay");
const $btnPinSetupCancel = document.getElementById("btn-pin-setup-cancel");

/* ================================================================
   Toast
   ================================================================ */
let toastTimer = null;

function showToast(msg, type = "success") {
  clearTimeout(toastTimer);
  // If the message is a localization key, resolve it
  const translated = getTranslation(msg) || msg;
  $toast.textContent = translated;
  $toast.className = `toast toast--visible toast--${type}`;
  toastTimer = setTimeout(() => {
    $toast.classList.remove("toast--visible");
  }, 2400);
}

/* ================================================================
   Clipboard Copy Helper
   ================================================================ */
async function copyToClipboard(text) {
  let success = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      success = true;
    }
  } catch (err) {
    console.warn("navigator.clipboard failed, using fallback", err);
  }

  if (!success) {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.top = "0";
      textarea.style.left = "0";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textarea);
      success = successful;
    } catch (err) {
      console.error("Fallback clipboard copy failed:", err);
    }
  }

  if (success) {
    triggerClipboardClearTimer();
  }
  return success;
}

/* ================================================================
   Toggle panels
   ================================================================ */
let formOpen = false;
let qrOpen = false;
let settingsOpen = false;

function closeAllPanels() {
  formOpen = false;
  qrOpen = false;
  settingsOpen = false;
  $addForm.classList.add("add-form--hidden");
  $qrPanel.classList.add("qr-panel--hidden");
  $settingsPanel.classList.add("settings-panel--hidden");
  $toggleForm.classList.remove("header__btn--active");
  $toggleQr.classList.remove("header__btn--active");
  $toggleSettings.classList.remove("header__btn--active");
  manualAccountType = "totp";
  manualAccountCounter = 0;
  
  // Reset Manual Form Title and button text
  $addFormTitle.textContent = getTranslation("panel_title_manual");
  $btnSave.textContent = getTranslation("btn_add_account");
  editingId = null;

  if ($newCatInlineContainer) {
    $newCatInlineContainer.style.display = "none";
  }
  resetQrPreview();
  
  document.body.classList.remove("settings-active");
}

$toggleForm.addEventListener("click", () => {
  if (formOpen) {
    closeAllPanels();
  } else {
    closeAllPanels();
    formOpen = true;
    $addForm.classList.remove("add-form--hidden");
    $toggleForm.classList.add("header__btn--active");
    $inputSvc.focus();
  }
});

$toggleQr.addEventListener("click", () => {
  if (qrOpen) {
    closeAllPanels();
  } else {
    closeAllPanels();
    qrOpen = true;
    $qrPanel.classList.remove("qr-panel--hidden");
    $toggleQr.classList.add("header__btn--active");
  }
});

$toggleSettings.addEventListener("click", () => {
  if (settingsOpen) {
    closeAllPanels();
  } else {
    closeAllPanels();
    settingsOpen = true;
    $settingsPanel.classList.remove("settings-panel--hidden");
    $toggleSettings.classList.add("header__btn--active");
    document.body.classList.add("settings-active");
  }
});

$btnSettingsBack.addEventListener("click", () => {
  closeAllPanels();
});

/* ================================================================
   Save handler (Manual / Edit)
   ================================================================ */
$btnSave.addEventListener("click", async () => {
  [$inputSvc, $inputLogin, $inputKey].forEach((el) =>
    el.classList.remove("add-form__input--error")
  );

  const service = $inputSvc.value.trim();
  const login   = $inputLogin.value.trim();
  const secret  = $inputKey.value.trim().replace(/\s+/g, "");
  const category = $selectCategory.value;

  let hasError = false;
  if (!service) { $inputSvc.classList.add("add-form__input--error"); hasError = true; }
  if (!login)   { $inputLogin.classList.add("add-form__input--error"); hasError = true; }
  if (!secret)  { $inputKey.classList.add("add-form__input--error"); hasError = true; }

  if (hasError) {
    showToast("toast_fill_fields", "error");
    return;
  }

  if (!isValidBase32(secret)) {
    $inputKey.classList.add("add-form__input--error");
    showToast("toast_invalid_base32", "error");
    return;
  }

  try {
    if (editingId) {
      await updateAccount(editingId, service, login, secret, 30, 6, "SHA-1", manualAccountType, manualAccountCounter, category);
      showToast("toast_code_updated");
    } else {
      await addAccount(service, login, secret, 30, 6, "SHA-1", manualAccountType, manualAccountCounter, category);
      showToast("toast_account_added");
    }
    
    $inputSvc.value = "";
    $inputLogin.value = "";
    $inputKey.value = "";
    $selectCategory.value = "none";
    closeAllPanels();
    await renderAccounts();
  } catch (err) {
    console.error(err);
    showToast("toast_save_error", "error");
  }
});

// Auto-parse pasted otpauth:// links in manual form secret field
$inputKey.addEventListener("input", () => {
  const value = $inputKey.value.trim();
  if (value.startsWith("otpauth://")) {
    try {
      const parsedList = parseOtpauthUrl(value);
      if (parsedList && parsedList.length > 0) {
        const acc = parsedList[0];
        $inputSvc.value = acc.service || "";
        $inputLogin.value = acc.login || "";
        $inputKey.value = acc.secret || "";
        manualAccountType = acc.type || "totp";
        manualAccountCounter = acc.counter || 0;
        showToast("toast_link_parsed");
      }
    } catch (err) {
      console.warn("Failed to auto-parse pasted otpauth URL:", err);
    }
  }
});

/* ================================================================
   QR Import Handlers
   ================================================================ */
let pendingQrAccounts = [];

function handleRecognizedAccounts(accountList) {
  pendingQrAccounts = accountList;
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

// 4. Ctrl+V Event Handler
document.addEventListener("paste", async (e) => {
  if (!qrOpen) return;
  const items = e.clipboardData.items;
  for (const item of items) {
    if (item.type.indexOf("image") !== -1) {
      const file = item.getAsFile();
      await scanFromFile(file, showToast, handleRecognizedAccounts);
      break;
    }
  }
});

$btnQrConfirm.addEventListener("click", async () => {
  if (pendingQrAccounts.length === 0) return;

  try {
    for (const acc of pendingQrAccounts) {
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
    showToast(pendingQrAccounts.length === 1 ? "toast_imported_qr" : getTranslation("toast_imported_count").replace("$1", pendingQrAccounts.length));
    closeAllPanels();
    await renderAccounts();
  } catch (err) {
    console.error(err);
    showToast("toast_save_error_multi", "error");
  }
});

$btnQrCancel.addEventListener("click", () => {
  resetQrPreview();
  showToast("toast_import_cancelled");
});

function resetQrPreview() {
  pendingQrAccounts = [];
  $qrPreview.classList.add("qr-preview--hidden");
  $qrPreviewList.innerHTML = "";
}

/* ================================================================
   Render accounts
   ================================================================ */
const TIMER_CIRCUMFERENCE = 2 * Math.PI * 14;

async function renderAccounts() {
  // If locked, do not render accounts list
  if (await isLocked()) {
    $lockScreen.classList.remove("lock-screen--hidden");
    return;
  }

  const accounts = await loadAccounts();
  $accounts.innerHTML = "";

  // Filter shown list by Category & Search query
  const query = $inputSearch.value.trim().toLowerCase();
  const shownAccounts = accounts.filter(acc => {
    const belongsToCat = currentCategory === "all" || (acc.category || "none") === currentCategory;
    const matchesSearch = !query || 
                          (acc.service || "").toLowerCase().includes(query) ||
                          (acc.login || "").toLowerCase().includes(query);
    return belongsToCat && matchesSearch;
  });

  if (shownAccounts.length === 0) {
    $empty.classList.remove("empty-state--hidden");
    return;
  }
  $empty.classList.add("empty-state--hidden");

  for (const acc of shownAccounts) {
    let secret;
    try {
      secret = await decryptSecret(acc.secret);
    } catch (err) {
      console.error("Failed to decrypt secret for service: " + acc.service, err);
      continue;
    }

    const period = acc.period || 30;
    const digits = acc.digits || 6;
    const algorithm = acc.algorithm || "SHA-1";
    const type = acc.type || "totp";
    const counter = acc.counter || 0;
    const category = acc.category || "none";

    let code = "ERROR";
    let isError = false;
    try {
      if (type === "totp") {
        const rawCode = await generateTOTP(secret, period, digits, algorithm);
        code = formatCode(rawCode);
      } else {
        const rawCode = await generateHOTP(secret, counter, digits, algorithm);
        code = formatCode(rawCode);
      }
    } catch (err) {
      console.error("Failed to generate OTP code for: " + acc.service, err);
      isError = true;
    }

    const card = document.createElement("div");
    card.className = "card";
    card.dataset.id = acc.id;
    card.dataset.type = type;

    const codeClass = appSettings.privacyMode ? "card__code card__code--hidden" : "card__code";

    let rightSideHtml = "";
    if (type === "totp") {
      card.dataset.period = period;
      const secs = secondsRemaining(period);
      const fraction = secs / period;
      const dashoffset = TIMER_CIRCUMFERENCE * (1 - fraction);
      rightSideHtml = `
        <div class="${secs <= 5 ? 'card__timer card__timer--danger' : secs <= 10 ? 'card__timer card__timer--warn' : 'card__timer'}">
          <svg viewBox="0 0 36 36">
            <circle class="card__timer-bg" cx="18" cy="18" r="14"/>
            <circle class="card__timer-fg"
                    cx="18" cy="18" r="14"
                    stroke-dasharray="${TIMER_CIRCUMFERENCE}"
                    stroke-dashoffset="${dashoffset}"
                    data-timer-ring />
          </svg>
          <span class="card__timer-text" data-timer-text>${secs}</span>
        </div>
      `;
    } else {
      rightSideHtml = `
        <button class="card__btn-refresh" data-id="${acc.id}" title="Сгенерировать следующий код">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
          </svg>
        </button>
      `;
    }

    // Category indicator class if category exists
    let catTagHtml = "";
    if (category !== "none") {
      const displayCatName = DEFAULT_CATEGORIES.includes(category) 
        ? getTranslation(`category_${category}`) 
        : category;
      catTagHtml = `<span class="category-chip category-chip--indicator" style="padding: 2px 6px; font-size: 9px; cursor: default; margin-left: 6px; background-color: var(--accent-glow); color: var(--accent); border-color: var(--accent); border-radius: 8px;">${escapeHtml(displayCatName)}</span>`;
    }

    card.innerHTML = `
      <div class="card__info">
        <div class="card__meta">
          <span class="card__service">${escapeHtml(acc.service)}</span>
          <span class="card__separator">:</span>
          <span class="card__login">${escapeHtml(acc.login)}</span>
          ${catTagHtml}
        </div>
        <div class="${codeClass}" data-code>${escapeHtml(code)}</div>
      </div>
      <div class="card__right">
        ${rightSideHtml}
      </div>
    `;

    $accounts.appendChild(card);
  }
}

/* ================================================================
   Event Delegation for Card Actions
   ================================================================ */
$accounts.addEventListener("click", async (e) => {
  const refreshBtn = e.target.closest(".card__btn-refresh");
  if (refreshBtn) {
    e.preventDefault();
    e.stopPropagation();
    const id = refreshBtn.dataset.id;
    try {
      await incrementCounter(id);
      showToast("toast_code_updated");
      await renderAccounts();
    } catch (err) {
      console.error(err);
      showToast("toast_update_error", "error");
    }
    return;
  }

  const card = e.target.closest(".card");
  if (card) {
    e.preventDefault();
    e.stopPropagation();

    const codeEl = card.querySelector("[data-code]");
    const raw = codeEl.textContent.replace(/\s/g, "");

    if (raw === "ERROR") {
      showToast("toast_gen_error", "error");
      return;
    }

    const success = await copyToClipboard(raw);
    if (success) {
      showToast("toast_code_copied");
    } else {
      showToast("toast_copy_error", "error");
    }
  }
});

// Context Menu triggers
$accounts.addEventListener("contextmenu", (e) => {
  const card = e.target.closest(".card");
  if (card) {
    e.preventDefault();
    e.stopPropagation();
    activeCardId = card.dataset.id;

    $contextMenu.classList.remove("context-menu--hidden");

    const menuWidth = $contextMenu.offsetWidth || 170;
    const menuHeight = $contextMenu.offsetHeight || 130;
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 10;
    }
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 10;
    }

    $contextMenu.style.left = `${x}px`;
    $contextMenu.style.top = `${y}px`;
  }
});

document.addEventListener("click", () => {
  $contextMenu.classList.add("context-menu--hidden");
});

// Copy from Context Menu
$ctxCopy.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!activeCardId) return;

  const card = document.querySelector(`.card[data-id="${activeCardId}"]`);
  if (card) {
    const codeEl = card.querySelector("[data-code]");
    const raw = codeEl.textContent.replace(/\s/g, "");
    if (raw === "ERROR") {
      showToast("toast_gen_error", "error");
      return;
    }
    const success = await copyToClipboard(raw);
    if (success) {
      showToast("toast_code_copied");
    } else {
      showToast("toast_copy_error", "error");
    }
  }
  $contextMenu.classList.add("context-menu--hidden");
});

// Edit from Context Menu
$ctxEdit.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  $contextMenu.classList.add("context-menu--hidden");
  if (!activeCardId) return;

  const accounts = await loadAccounts();
  const acc = accounts.find(a => a.id === activeCardId);
  if (acc) {
    try {
      const plainSecret = await decryptSecret(acc.secret);
      $inputSvc.value = acc.service || "";
      $inputLogin.value = acc.login || "";
      $inputKey.value = plainSecret;
      $selectCategory.value = acc.category || "none";
      
      closeAllPanels();
      formOpen = true;
      $addForm.classList.remove("add-form--hidden");
      $toggleForm.classList.add("header__btn--active");
      
      // Update form headers dynamically
      $addFormTitle.textContent = getTranslation("panel_title_edit");
      $btnSave.textContent = getTranslation("btn_save_changes");
      editingId = activeCardId;
    } catch (err) {
      console.error(err);
      showToast("toast_file_read_error", "error");
    }
  }
});

// Move from Context Menu
$ctxMove.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  $contextMenu.classList.add("context-menu--hidden");
  if (!activeCardId) return;

  const card = document.querySelector(`.card[data-id="${activeCardId}"]`);
  if (card) {
    setTimeout(() => {
      startReorderMode(card);
    }, 50);
  }
});

// Delete from Context Menu
$ctxDelete.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!activeCardId) return;

  const card = document.querySelector(`.card[data-id="${activeCardId}"]`);
  if (card) {
    const id = activeCardId;
    card.classList.add("card--removing");
    card.addEventListener("animationend", async () => {
      await removeAccount(id);
      await renderAccounts();
      showToast("toast_account_deleted");
    }, { once: true });
  }
  $contextMenu.classList.add("context-menu--hidden");
});

// Show QR from Context Menu
$ctxQr.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  $contextMenu.classList.add("context-menu--hidden");
  if (!activeCardId) return;

  const accounts = await loadAccounts();
  const acc = accounts.find(a => a.id === activeCardId);
  if (acc) {
    try {
      const plainSecret = await decryptSecret(acc.secret);
      const type = acc.type || "totp";
      const service = acc.service || "Service";
      const login = acc.login || "user";
      const period = acc.period || 30;
      const digits = acc.digits || 6;
      const algorithm = acc.algorithm || "SHA-1";
      const counter = acc.counter || 0;

      // Construct standard otpauth:// URL
      let otpauthUrl = `otpauth://${type}/${encodeURIComponent(service)}:${encodeURIComponent(login)}?secret=${plainSecret}&issuer=${encodeURIComponent(service)}`;
      if (type === "totp") {
        otpauthUrl += `&period=${period}`;
      } else {
        otpauthUrl += `&counter=${counter}`;
      }
      if (digits !== 6) {
        otpauthUrl += `&digits=${digits}`;
      }
      if (algorithm !== "SHA-1") {
        otpauthUrl += `&algorithm=${algorithm}`;
      }

      // Populate Title
      $qrModalTitle.textContent = `${service} (${login})`;

      // Render QR code
      $qrModalCode.innerHTML = "";
      new QRCode($qrModalCode, {
        text: otpauthUrl,
        width: 160,
        height: 160,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
      });

      // Show modal
      $qrModal.classList.remove("qr-modal--hidden");
    } catch (err) {
      console.error(err);
      showToast("toast_save_error", "error");
    }
  }
});

// Close QR Modal
$btnQrModalClose.addEventListener("click", () => {
  $qrModal.classList.add("qr-modal--hidden");
});

$qrModal.addEventListener("click", (e) => {
  if (e.target === $qrModal) {
    $qrModal.classList.add("qr-modal--hidden");
  }
});

/* ================================================================
   Live Refresh loops
   ================================================================ */
async function tick() {
  if (await isLocked()) return; // pause loops if locked

  let needsReRender = false;

  document.querySelectorAll(".card[data-type='totp']").forEach((card) => {
    const period = parseInt(card.dataset.period, 10) || 30;
    const secs = secondsRemaining(period);
    const fraction = secs / period;
    const dashoffset = TIMER_CIRCUMFERENCE * (1 - fraction);

    const ring = card.querySelector("[data-timer-ring]");
    if (ring) {
      ring.setAttribute("stroke-dashoffset", dashoffset);
    }

    const txt = card.querySelector("[data-timer-text]");
    if (txt) {
      txt.textContent = secs;
    }

    const timerContainer = card.querySelector("[class*='card__timer']");
    if (timerContainer) {
      if (secs <= 5) {
        timerContainer.className = "card__timer card__timer--danger";
      } else if (secs <= 10) {
        timerContainer.className = "card__timer card__timer--warn";
      } else {
        timerContainer.className = "card__timer";
      }
    }

    if (secs === period) {
      needsReRender = true;
    }
  });

  if (needsReRender) {
    await renderAccounts();
  }
}

/* ================================================================
   Settings handling
   ================================================================ */
const SETTINGS_KEY = "app_settings";
let appSettings = {
  accentColor: "white",
  themeMode: "dark",
  language: "auto",
  privacyMode: false,
  clearClipboardSec: 30
};

async function loadAppSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(SETTINGS_KEY, (syncResult) => {
      const syncSaved = syncResult[SETTINGS_KEY];
      if (syncSaved) {
        appSettings = {
          accentColor: syncSaved.accentColor || "white",
          themeMode: syncSaved.themeMode || "dark",
          language: syncSaved.language || "auto",
          privacyMode: syncSaved.privacyMode !== undefined ? syncSaved.privacyMode : false,
          clearClipboardSec: syncSaved.clearClipboardSec !== undefined ? parseInt(syncSaved.clearClipboardSec, 10) : 30
        };
        resolve(appSettings);
      } else {
        chrome.storage.local.get(SETTINGS_KEY, async (localResult) => {
          const localSaved = localResult[SETTINGS_KEY] || {};
          appSettings = {
            accentColor: localSaved.accentColor || "white",
            themeMode: localSaved.themeMode || "dark",
            language: localSaved.language || "auto",
            privacyMode: localSaved.privacyMode !== undefined ? localSaved.privacyMode : false,
            clearClipboardSec: localSaved.clearClipboardSec !== undefined ? parseInt(localSaved.clearClipboardSec, 10) : 30
          };
          await saveAppSettings();
          chrome.storage.local.remove(SETTINGS_KEY);
          resolve(appSettings);
        });
      }
    });
  });
}

async function saveAppSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [SETTINGS_KEY]: appSettings }, resolve);
  });
}

async function populateSettingsUI() {
  $settingPrivacy.checked = appSettings.privacyMode;
  $settingClearClipboard.value = appSettings.clearClipboardSec.toString();
  $settingThemeMode.value = appSettings.themeMode;
  $settingLanguage.value = appSettings.language;
  applyThemeMode(appSettings.themeMode);
  applyAccentColor(appSettings.accentColor, $colorDots, appSettings.themeMode);
  
  const isPinSet = await hasPinSet();
  $settingPinLock.checked = isPinSet;
}

// Clipboard auto-clear timer
let clipboardClearTimeout = null;

function triggerClipboardClearTimer() {
  clearTimeout(clipboardClearTimeout);
  if (appSettings.clearClipboardSec <= 0) return;

  clipboardClearTimeout = setTimeout(async () => {
    try {
      await navigator.clipboard.writeText("");
      showToast("toast_clipboard_cleared", "success");
    } catch (err) {
      console.error("Failed to clear clipboard:", err);
    }
  }, appSettings.clearClipboardSec * 1000);
}

// Accent color choices
$colorDots.forEach(dot => {
  dot.addEventListener("click", async () => {
    const color = dot.dataset.color;
    appSettings.accentColor = color;
    applyAccentColor(color, $colorDots, appSettings.themeMode);
    await saveAppSettings();
    showToast("toast_accent_updated");
  });
});

// Privacy Mode setting
$settingPrivacy.addEventListener("change", async (e) => {
  appSettings.privacyMode = e.target.checked;
  await saveAppSettings();
  await renderAccounts();
  showToast(appSettings.privacyMode ? "toast_privacy_enabled" : "toast_privacy_disabled");
});

// Auto-clear Clipboard timeout choice
$settingClearClipboard.addEventListener("change", async (e) => {
  appSettings.clearClipboardSec = parseInt(e.target.value, 10);
  await saveAppSettings();
  showToast("toast_clipboard_timer_updated");
});

// Theme Mode select setting
$settingThemeMode.addEventListener("change", async (e) => {
  const selectedTheme = e.target.value;
  appSettings.themeMode = selectedTheme;
  applyThemeMode(selectedTheme);
  applyAccentColor(appSettings.accentColor, $colorDots, selectedTheme);
  await saveAppSettings();
});

// Language select setting
$settingLanguage.addEventListener("change", async (e) => {
  const selectedLang = e.target.value;
  appSettings.language = selectedLang;
  setLanguage(selectedLang);
  initTranslations();
  await renderCategoriesUI();
  await renderAccounts();
  await saveAppSettings();
});

// PIN Lock checkbox click triggers setup or verify/remove
$settingPinLock.addEventListener("change", async (e) => {
  const turnOn = e.target.checked;
  
  if (turnOn) {
    // Show PIN Setup Overlay
    $pinSetupOverlay.classList.remove("lock-screen--hidden");
    resetSetupOverlay();
  } else {
    // Turn off: Ask to verify current PIN first
    $pinSetupOverlay.classList.remove("lock-screen--hidden");
    resetSetupOverlay();
    isDisablingPin = true;
    
    const $setupTitle = document.getElementById("pin-setup-title");
    $setupTitle.textContent = getTranslation("pin_enter_current");
  }
});

// Backup buttons click triggers
$btnBackupExport.addEventListener("click", async () => {
  await exportBackup(showToast);
});

$btnBackupImportTrigger.addEventListener("click", () => {
  $inputBackupFile.click();
});

$inputBackupFile.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (file) {
    importBackup(file, showToast, renderAccounts);
  }
  $inputBackupFile.value = "";
});

/* ================================================================
   Search Bar Filtering Logic
   ================================================================ */
$inputSearch.addEventListener("input", () => {
  const query = $inputSearch.value.trim().toLowerCase();
  if (query) {
    $btnSearchClear.classList.remove("search-bar__clear--hidden");
  } else {
    $btnSearchClear.classList.add("search-bar__clear--hidden");
  }
  renderAccounts();
});

$btnSearchClear.addEventListener("click", () => {
  $inputSearch.value = "";
  $btnSearchClear.classList.add("search-bar__clear--hidden");
  renderAccounts();
  $inputSearch.focus();
});

/* ================================================================
   Horizontal Scroll on Hover triggers
   ================================================================ */
$accounts.addEventListener("mouseenter", (e) => {
  const card = e.target.closest(".card");
  if (!card) return;
  const meta = card.querySelector(".card__meta");
  if (meta) startHorizontalScroll(meta);
}, true);

$accounts.addEventListener("mouseleave", (e) => {
  const card = e.target.closest(".card");
  if (!card) return;
  const meta = card.querySelector(".card__meta");
  if (meta) stopHorizontalScroll(meta);
}, true);

/* ================================================================
   Categories Chips Filtering & Manager UI Logic
   ================================================================ */
async function renderCategoriesUI() {
  const customCats = await loadCustomCategories();
  const allCats = [...DEFAULT_CATEGORIES, ...customCats];

  // 1. Render chips
  const activeCategoryBefore = currentCategory;
  $categoriesWrapper.innerHTML = "";
  
  const btnAll = document.createElement("button");
  btnAll.className = `category-chip ${activeCategoryBefore === 'all' ? 'category-chip--active' : ''}`;
  btnAll.dataset.category = "all";
  btnAll.textContent = getTranslation("category_all");
  $categoriesWrapper.appendChild(btnAll);

  allCats.forEach(cat => {
    const btn = document.createElement("button");
    btn.className = `category-chip ${activeCategoryBefore === cat ? 'category-chip--active' : ''}`;
    btn.dataset.category = cat;
    if (DEFAULT_CATEGORIES.includes(cat)) {
      btn.textContent = getTranslation(`category_${cat}`);
    } else {
      btn.textContent = cat;
    }
    $categoriesWrapper.appendChild(btn);
  });

  // 2. Render select options inside manual add-form
  const selectedValBefore = $selectCategory.value || "none";
  $selectCategory.innerHTML = "";
  
  const optNone = document.createElement("option");
  optNone.value = "none";
  optNone.textContent = getTranslation("category_none");
  $selectCategory.appendChild(optNone);

  allCats.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    if (DEFAULT_CATEGORIES.includes(cat)) {
      opt.textContent = getTranslation(`category_${cat}`);
    } else {
      opt.textContent = cat;
    }
    $selectCategory.appendChild(opt);
  });

  // Always append '+ Create new category...' at the end of the select list
  const optCreate = document.createElement("option");
  optCreate.value = "__create_new__";
  optCreate.textContent = getTranslation("category_create_new");
  optCreate.style.fontWeight = "bold";
  optCreate.style.color = "var(--accent)";
  $selectCategory.appendChild(optCreate);

  $selectCategory.value = selectedValBefore;
}

// Chips bar clicks delegation
$categoriesWrapper.addEventListener("click", (e) => {
  const chip = e.target.closest(".category-chip");
  if (chip) {
    $categoriesWrapper.querySelectorAll(".category-chip").forEach(c => c.classList.remove("category-chip--active"));
    chip.classList.add("category-chip--active");
    currentCategory = chip.dataset.category;
    renderAccounts();
  }
});

// Categories bar horizontal scroll translator for mouse wheels
const $categoriesBar = document.querySelector(".categories-bar");
if ($categoriesBar) {
  $categoriesBar.addEventListener("wheel", (e) => {
    if (e.deltaY !== 0) {
      e.preventDefault();
      $categoriesBar.scrollLeft += e.deltaY * 0.85;
    }
  }, { passive: false });
}

// Select dropdown change listener to toggle inline category inputs
$selectCategory.addEventListener("change", (e) => {
  if (e.target.value === "__create_new__") {
    $newCatInlineContainer.style.display = "flex";
    $inputNewCatInline.value = "";
    $inputNewCatInline.focus();
  } else {
    $newCatInlineContainer.style.display = "none";
  }
});

// Add Category inline save
$btnSaveNewCatInline.addEventListener("click", async () => {
  const name = $inputNewCatInline.value.trim();
  if (!name) {
    showToast("toast_category_empty", "error");
    return;
  }

  if (name.toLowerCase() === "all" || name.toLowerCase() === "none" || DEFAULT_CATEGORIES.includes(name.toLowerCase())) {
    showToast("toast_category_exists", "error");
    return;
  }

  const success = await addCustomCategory(name);
  if (success) {
    showToast("toast_category_added", "success");
    await renderCategoriesUI();
    
    // Select the newly created category
    $selectCategory.value = name;
    $newCatInlineContainer.style.display = "none";
    await renderAccounts();
  } else {
    showToast("toast_category_exists", "error");
  }
});

$inputNewCatInline.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $btnSaveNewCatInline.click();
  }
});

// Add Category inline cancel
$btnCancelNewCatInline.addEventListener("click", () => {
  $selectCategory.value = "none";
  $newCatInlineContainer.style.display = "none";
});

// Note: Categories management is handled inline within the add/edit form

/* ================================================================
   PIN Lock / Unlock screen controls
   ================================================================ */
let unlockPinVal = "";

const $lockNumpadBtns = document.querySelectorAll("#lock-numpad .numpad-btn");
$lockNumpadBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    const val = btn.dataset.val;
    handleUnlockKeypad(val);
  });
});

function handleUnlockKeypad(val) {
  if (val === "clear") {
    unlockPinVal = "";
  } else if (val === "delete") {
    unlockPinVal = unlockPinVal.slice(0, -1);
  } else {
    if (unlockPinVal.length < 4) {
      unlockPinVal += val;
    }
  }
  updateDotsIndicator("lock-dots", unlockPinVal.length);

  if (unlockPinVal.length === 4) {
    setTimeout(async () => {
      try {
        await unlockKey(unlockPinVal);
        $lockScreen.classList.add("lock-screen--hidden");
        unlockPinVal = "";
        updateDotsIndicator("lock-dots", 0);
        await renderAccounts();
      } catch (err) {
        console.error(err);
        $lockScreen.classList.add("lock-screen--shake");
        showToast("toast_pin_incorrect", "error");
        unlockPinVal = "";
        updateDotsIndicator("lock-dots", 0);
        setTimeout(() => {
          $lockScreen.classList.remove("lock-screen--shake");
        }, 250);
      }
    }, 120);
  }
}

// PIN Setup / Verify keypad controls
let setupPinVal = "";
let setupConfirmVal = "";
let isConfirming = false;
let isDisablingPin = false;

const $setupNumpadBtns = document.querySelectorAll("#setup-numpad .numpad-btn");
$setupNumpadBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    const val = btn.dataset.val;
    handleSetupKeypad(val);
  });
});

$btnPinSetupCancel.addEventListener("click", () => {
  $pinSetupOverlay.classList.add("lock-screen--hidden");
  resetSetupOverlay();
});

function resetSetupOverlay() {
  setupPinVal = "";
  setupConfirmVal = "";
  isConfirming = false;
  isDisablingPin = false;
  updateDotsIndicator("setup-dots", 0);
  const $setupTitle = document.getElementById("pin-setup-title");
  $setupTitle.textContent = getTranslation("pin_setup_title");
  
  // Reset settings checkbox visual lock state
  hasPinSet().then(hasPin => {
    $settingPinLock.checked = hasPin;
  });
}

function handleSetupKeypad(val) {
  if (val === "cancel") {
    $pinSetupOverlay.classList.add("lock-screen--hidden");
    resetSetupOverlay();
    return;
  }
  
  if (val === "delete") {
    if (isDisablingPin) {
      setupPinVal = setupPinVal.slice(0, -1);
      updateDotsIndicator("setup-dots", setupPinVal.length);
    } else if (isConfirming) {
      setupConfirmVal = setupConfirmVal.slice(0, -1);
      updateDotsIndicator("setup-dots", setupConfirmVal.length);
    } else {
      setupPinVal = setupPinVal.slice(0, -1);
      updateDotsIndicator("setup-dots", setupPinVal.length);
    }
    return;
  }

  // If we are disabling the PIN, verify it first
  if (isDisablingPin) {
    if (setupPinVal.length < 4) {
      setupPinVal += val;
    }
    updateDotsIndicator("setup-dots", setupPinVal.length);
    
    if (setupPinVal.length === 4) {
      setTimeout(async () => {
        try {
          await removePin(setupPinVal);
          $pinSetupOverlay.classList.add("lock-screen--hidden");
          $settingPinLock.checked = false;
          showToast("toast_pin_disabled", "success");
          resetSetupOverlay();
        } catch (err) {
          console.error(err);
          $pinSetupOverlay.classList.add("lock-screen--shake");
          showToast("toast_pin_incorrect", "error");
          setupPinVal = "";
          updateDotsIndicator("setup-dots", 0);
          setTimeout(() => {
            $pinSetupOverlay.classList.remove("lock-screen--shake");
          }, 250);
        }
      }, 120);
    }
    return;
  }

  // Creating PIN flow
  if (!isConfirming) {
    if (setupPinVal.length < 4) {
      setupPinVal += val;
    }
    updateDotsIndicator("setup-dots", setupPinVal.length);
    
    if (setupPinVal.length === 4) {
      setTimeout(() => {
        isConfirming = true;
        const $setupTitle = document.getElementById("pin-setup-title");
        $setupTitle.textContent = getTranslation("pin_confirm_title");
        updateDotsIndicator("setup-dots", 0);
      }, 150);
    }
  } else {
    if (setupConfirmVal.length < 4) {
      setupConfirmVal += val;
    }
    updateDotsIndicator("setup-dots", setupConfirmVal.length);
    
    if (setupConfirmVal.length === 4) {
      setTimeout(async () => {
        if (setupPinVal === setupConfirmVal) {
          try {
            await setupPin(setupPinVal);
            $pinSetupOverlay.classList.add("lock-screen--hidden");
            $settingPinLock.checked = true;
            showToast("toast_pin_set", "success");
            resetSetupOverlay();
          } catch (err) {
            console.error(err);
            showToast("toast_save_error", "error");
            $pinSetupOverlay.classList.add("lock-screen--hidden");
            resetSetupOverlay();
          }
        } else {
          $pinSetupOverlay.classList.add("lock-screen--shake");
          showToast("toast_pin_mismatch", "error");
          resetSetupOverlay();
          setTimeout(() => {
            $pinSetupOverlay.classList.remove("lock-screen--shake");
          }, 250);
        }
      }, 150);
    }
  }
}

function updateDotsIndicator(containerId, count) {
  const dots = document.querySelectorAll(`#${containerId} .lock-screen__dot`);
  dots.forEach((dot, idx) => {
    if (idx < count) {
      dot.classList.add("lock-screen__dot--filled");
    } else {
      dot.classList.remove("lock-screen__dot--filled");
    }
  });
}

/* ================================================================
   Helpers
   ================================================================ */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatCode(code) {
  if (code.length === 6) {
    return code.slice(0, 3) + " " + code.slice(3);
  } else if (code.length === 8) {
    return code.slice(0, 4) + " " + code.slice(4);
  }
  return code;
}

/* ================================================================
   Boot logic
   ================================================================ */
(async () => {
  // Load local settings & apply theme
  await loadAppSettings();
  
  // Set up localized elements
  setLanguage(appSettings.language);
  initTranslations();
  populateSettingsUI();

  // Load Custom Categories UI
  await renderCategoriesUI();

  // Initialize reordering logic
  initDragAndDrop($accounts, showToast);

  // Lock status check
  const locked = await isLocked();
  if (locked) {
    $lockScreen.classList.remove("lock-screen--hidden");
  } else {
    await renderAccounts();
  }

  setInterval(tick, 1000);
})();
