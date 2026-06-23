/**
 * popup.js – Main modular controller bootstrapper for OnePass Auth extension.
 */

import { state, showToast, closeAllPanels } from './app-state.js';
import { 
  isLocked 
} from './crypto.js';
import { 
  secondsRemaining, isValidBase32 
} from './totp.js';
import { 
  addAccount, updateAccount, addCustomCategory 
} from './storage.js';
import { 
  parseOtpauthUrl 
} from './qr.js';
import { 
  initTranslations, getTranslation, setLanguage
} from './i18n.js';
import { 
  initDragAndDrop 
} from './drag-drop.js';
import { 
  initSettingsController, loadAppSettings, populateSettingsUI 
} from './settings-controller.js';
import { 
  initAccountsController, renderAccounts, renderCategoriesUI 
} from './accounts-controller.js';
import { 
  initQrController 
} from './qr-controller.js';

/* ================================================================
   DOM references (Manual Form specific)
   ================================================================ */
const $toggleForm      = document.getElementById("btn-toggle-form");
const $toggleQr        = document.getElementById("btn-toggle-qr");
const $toggleSettings  = document.getElementById("btn-toggle-settings");
const $addForm         = document.getElementById("add-form");
const $qrPanel         = document.getElementById("qr-panel");
const $settingsPanel   = document.getElementById("settings-panel");
const $addFormTitle    = document.getElementById("add-form-title");
const $btnSave         = document.getElementById("btn-save");

// Manual form inputs
const $inputSvc        = document.getElementById("input-service");
const $inputLogin      = document.getElementById("input-login");
const $inputKey        = document.getElementById("input-secret");
const $selectCategory  = document.getElementById("select-category");

// Inline category creator references
const $newCatInlineContainer = document.getElementById("add-form-new-cat-container");
const $inputNewCatInline    = document.getElementById("input-new-cat-inline");
const $btnSaveNewCatInline  = document.getElementById("btn-save-new-cat-inline");
const $btnCancelNewCatInline = document.getElementById("btn-cancel-new-cat-inline");

const $accounts        = document.getElementById("accounts");
const $lockScreen      = document.getElementById("lock-screen");

/* ================================================================
   Manual Form Panel Toggles
   ================================================================ */
$toggleForm.addEventListener("click", () => {
  if (state.formOpen) {
    closeAllPanels();
  } else {
    closeAllPanels();
    state.formOpen = true;
    $addForm.classList.remove("add-form--hidden");
    $toggleForm.classList.add("header__btn--active");
    $inputSvc.focus();
  }
});

$toggleQr.addEventListener("click", () => {
  if (state.qrOpen) {
    closeAllPanels();
  } else {
    closeAllPanels();
    state.qrOpen = true;
    $qrPanel.classList.remove("qr-panel--hidden");
    $toggleQr.classList.add("header__btn--active");
  }
});

$toggleSettings.addEventListener("click", () => {
  if (state.settingsOpen) {
    closeAllPanels();
  } else {
    closeAllPanels();
    state.settingsOpen = true;
    $settingsPanel.classList.remove("settings-panel--hidden");
    $toggleSettings.classList.add("header__btn--active");
    document.body.classList.add("settings-active");
  }
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
    if (state.editingId) {
      await updateAccount(state.editingId, service, login, secret, 30, 6, "SHA-1", state.manualAccountType, state.manualAccountCounter, category);
      showToast("toast_code_updated");
    } else {
      await addAccount(service, login, secret, 30, 6, "SHA-1", state.manualAccountType, state.manualAccountCounter, category);
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
        state.manualAccountType = acc.type || "totp";
        state.manualAccountCounter = acc.counter || 0;
        showToast("toast_link_parsed");
      }
    } catch (err) {
      console.warn("Failed to auto-parse pasted otpauth URL:", err);
    }
  }
});

/* ================================================================
   Select dropdown change listener to toggle inline category inputs
   ================================================================ */
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

  const DEFAULT_CATEGORIES = [];
  if (name.toLowerCase() === "all" || name.toLowerCase() === "none" || DEFAULT_CATEGORIES.includes(name.toLowerCase())) {
    showToast("toast_category_exists", "error");
    return;
  }

  const success = await addCustomCategory(name);
  if (success) {
    showToast("toast_category_added", "success");
    await renderCategoriesUI();
    
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

/* ================================================================
   Live Refresh loops
   ================================================================ */
const TIMER_CIRCUMFERENCE = 2 * Math.PI * 14;

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
   Boot logic
   ================================================================ */
(async () => {
  // Load local settings & apply theme
  await loadAppSettings();
  
  // Set up localized elements
  setLanguage(state.appSettings.language);
  initTranslations();
  populateSettingsUI();

  // Initialize modular controllers
  initSettingsController();
  initAccountsController();
  initQrController();

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
