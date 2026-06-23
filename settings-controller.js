import { state, showToast, closeAllPanels, triggerClipboardClearTimer } from './app-state.js';
import { 
  isLocked, unlockKey, setupPin, removePin, hasPinSet 
} from './crypto.js';
import { 
  applyAccentColor, applyThemeMode 
} from './ui.js';
import { 
  setLanguage, initTranslations, getTranslation 
} from './i18n.js';
import { 
  exportBackup, importBackup 
} from './backup.js';
import { 
  renderAccounts, renderCategoriesUI 
} from './accounts-controller.js';

/* ================================================================
   DOM references (Settings specific)
   ================================================================ */
const $colorDots             = document.querySelectorAll(".color-dot");
const $settingThemeMode      = document.getElementById("setting-theme-mode");
const $settingLanguage       = document.getElementById("setting-language");
const $settingPrivacy        = document.getElementById("setting-privacy");
const $settingPinLock        = document.getElementById("setting-pin-lock");
const $settingClearClipboard = document.getElementById("setting-clear-clipboard");
const $btnBackupExport       = document.getElementById("btn-backup-export");
const $btnBackupImportTrigger = document.getElementById("btn-backup-import-trigger");
const $inputBackupFile       = document.getElementById("input-backup-file");
const $lockScreen            = document.getElementById("lock-screen");
const $pinSetupOverlay       = document.getElementById("pin-setup-overlay");
const $btnPinSetupCancel     = document.getElementById("btn-pin-setup-cancel");

/* ================================================================
   Local State variables for PIN Keypads
   ================================================================ */
let unlockPinVal = "";
let setupPinVal = "";
let setupConfirmVal = "";
let isConfirming = false;
let isDisablingPin = false;

const SETTINGS_KEY = "app_settings";

/* ================================================================
   Settings Storage Helpers
   ================================================================ */
export async function loadAppSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(SETTINGS_KEY, (syncResult) => {
      const syncSaved = syncResult[SETTINGS_KEY];
      if (syncSaved) {
        state.appSettings = {
          accentColor: syncSaved.accentColor || "white",
          themeMode: syncSaved.themeMode || "dark",
          language: syncSaved.language || "auto",
          privacyMode: syncSaved.privacyMode !== undefined ? syncSaved.privacyMode : false,
          clearClipboardSec: syncSaved.clearClipboardSec !== undefined ? parseInt(syncSaved.clearClipboardSec, 10) : 30
        };
        resolve(state.appSettings);
      } else {
        chrome.storage.local.get(SETTINGS_KEY, async (localResult) => {
          const localSaved = localResult[SETTINGS_KEY] || {};
          state.appSettings = {
            accentColor: localSaved.accentColor || "white",
            themeMode: localSaved.themeMode || "dark",
            language: localSaved.language || "auto",
            privacyMode: localSaved.privacyMode !== undefined ? localSaved.privacyMode : false,
            clearClipboardSec: localSaved.clearClipboardSec !== undefined ? parseInt(localSaved.clearClipboardSec, 10) : 30
          };
          await saveAppSettings();
          chrome.storage.local.remove(SETTINGS_KEY);
          resolve(state.appSettings);
        });
      }
    });
  });
}

export async function saveAppSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [SETTINGS_KEY]: state.appSettings }, resolve);
  });
}

export async function populateSettingsUI() {
  $settingPrivacy.checked = state.appSettings.privacyMode;
  $settingClearClipboard.value = state.appSettings.clearClipboardSec.toString();
  $settingThemeMode.value = state.appSettings.themeMode;
  $settingLanguage.value = state.appSettings.language;
  applyThemeMode(state.appSettings.themeMode);
  applyAccentColor(state.appSettings.accentColor, $colorDots, state.appSettings.themeMode);
  
  const isPinSet = await hasPinSet();
  $settingPinLock.checked = isPinSet;
}

/* ================================================================
   PIN Lock / Unlock screen controls
   ================================================================ */
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
   Initialize Event Listeners
   ================================================================ */
export function initSettingsController() {
  // Accent color choices
  $colorDots.forEach(dot => {
    dot.addEventListener("click", async () => {
      const color = dot.dataset.color;
      state.appSettings.accentColor = color;
      applyAccentColor(color, $colorDots, state.appSettings.themeMode);
      await saveAppSettings();
      showToast("toast_accent_updated");
    });
  });

  // Privacy Mode setting
  $settingPrivacy.addEventListener("change", async (e) => {
    state.appSettings.privacyMode = e.target.checked;
    await saveAppSettings();
    await renderAccounts();
    showToast(state.appSettings.privacyMode ? "toast_privacy_enabled" : "toast_privacy_disabled");
  });

  // Auto-clear Clipboard timeout choice
  $settingClearClipboard.addEventListener("change", async (e) => {
    state.appSettings.clearClipboardSec = parseInt(e.target.value, 10);
    await saveAppSettings();
    showToast("toast_clipboard_timer_updated");
  });

  // Theme Mode select setting
  $settingThemeMode.addEventListener("change", async (e) => {
    const selectedTheme = e.target.value;
    state.appSettings.themeMode = selectedTheme;
    applyThemeMode(selectedTheme);
    applyAccentColor(state.appSettings.accentColor, $colorDots, selectedTheme);
    await saveAppSettings();
  });

  // Language select setting
  $settingLanguage.addEventListener("change", async (e) => {
    const selectedLang = e.target.value;
    state.appSettings.language = selectedLang;
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
      $pinSetupOverlay.classList.remove("lock-screen--hidden");
      resetSetupOverlay();
    } else {
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

  // Unlock numpad buttons listeners
  const $lockNumpadBtns = document.querySelectorAll("#lock-numpad .numpad-btn");
  $lockNumpadBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const val = btn.dataset.val;
      handleUnlockKeypad(val);
    });
  });

  // Setup numpad buttons listeners
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
}
