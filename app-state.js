import { getTranslation } from './i18n.js';

/* ================================================================
   Global Mutable State Object
   ================================================================ */
export const state = {
  appSettings: {
    accentColor: "white",
    themeMode: "dark",
    language: "auto",
    privacyMode: false,
    clearClipboardSec: 30
  },
  currentCategory: "all",
  editingId: null,
  activeCardId: null,
  manualAccountType: "totp",
  manualAccountCounter: 0,
  formOpen: false,
  qrOpen: false,
  settingsOpen: false,
  pendingQrAccounts: []
};

/* ================================================================
   Globally Used DOM references
   ================================================================ */
export const $toast                = document.getElementById("toast");
export const $contextMenu          = document.getElementById("context-menu");
export const $accounts             = document.getElementById("accounts");
export const $empty                = document.getElementById("empty-state");
export const $addForm              = document.getElementById("add-form");
export const $addFormTitle         = document.getElementById("add-form-title");
export const $qrPanel              = document.getElementById("qr-panel");
export const $settingsPanel        = document.getElementById("settings-panel");
export const $toggleForm           = document.getElementById("btn-toggle-form");
export const $toggleQr             = document.getElementById("btn-toggle-qr");
export const $toggleSettings       = document.getElementById("btn-toggle-settings");
export const $selectCategory       = document.getElementById("select-category");
export const $inputSvc             = document.getElementById("input-service");
export const $inputLogin           = document.getElementById("input-login");
export const $inputKey             = document.getElementById("input-secret");
export const $btnSave              = document.getElementById("btn-save");
export const $newCatInlineContainer = document.getElementById("add-form-new-cat-container");
export const $inputNewCatInline    = document.getElementById("input-new-cat-inline");
export const $btnSaveNewCatInline  = document.getElementById("btn-save-new-cat-inline");
export const $btnCancelNewCatInline = document.getElementById("btn-cancel-new-cat-inline");
export const $qrPreview            = document.getElementById("qr-preview");
export const $qrPreviewList        = document.getElementById("qr-preview-list");

/* ================================================================
   Toast Alerts
   ================================================================ */
let toastTimer = null;

export function showToast(msg, type = "success") {
  clearTimeout(toastTimer);
  const translated = getTranslation(msg) || msg;
  $toast.textContent = translated;
  $toast.className = `toast toast--visible toast--${type}`;
  toastTimer = setTimeout(() => {
    $toast.classList.remove("toast--visible");
  }, 2400);
}

/* ================================================================
   Panel state toggler
   ================================================================ */
export function closeAllPanels() {
  state.formOpen = false;
  state.qrOpen = false;
  state.settingsOpen = false;

  $addForm.classList.add("add-form--hidden");
  $qrPanel.classList.add("qr-panel--hidden");
  $settingsPanel.classList.add("settings-panel--hidden");

  $toggleForm.classList.remove("header__btn--active");
  $toggleQr.classList.remove("header__btn--active");
  $toggleSettings.classList.remove("header__btn--active");

  state.manualAccountType = "totp";
  state.manualAccountCounter = 0;
  state.editingId = null;

  $addFormTitle.textContent = getTranslation("panel_title_manual");
  $btnSave.textContent = getTranslation("btn_add_account");

  if ($newCatInlineContainer) {
    $newCatInlineContainer.style.display = "none";
  }

  // Reset QR Preview
  state.pendingQrAccounts = [];
  $qrPreview.classList.add("qr-preview--hidden");
  $qrPreviewList.innerHTML = "";

  document.body.classList.remove("settings-active");
}

/* ================================================================
   Clipboard Copy Helper
   ================================================================ */
let clipboardClearTimeout = null;

export function triggerClipboardClearTimer() {
  clearTimeout(clipboardClearTimeout);
  if (state.appSettings.clearClipboardSec <= 0) return;

  clipboardClearTimeout = setTimeout(async () => {
    try {
      await navigator.clipboard.writeText("");
      showToast("toast_clipboard_cleared", "success");
    } catch (err) {
      console.error("Failed to clear clipboard:", err);
    }
  }, state.appSettings.clearClipboardSec * 1000);
}

export async function copyToClipboard(text) {
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
