/**
 * popup.js – Main controller for the Authenticator popup UI.
 *
 * Responsibilities:
 *  • Render account cards with live TOTP codes (supports dynamic digits, periods, and SHA algorithms)
 *  • Run a per-account 1 s tick loop for timer rings + code refresh
 *  • Handle manual add & QR code import (single standard codes and multiple Google migration codes)
 *  • Support scanning QR from active screen capture, clipboard pastes, or file uploads
 *  • Handle delete / copy actions using robust Event Delegation and Clipboard APIs
 *  • Toast notifications for feedback
 */

/* ================================================================
   DOM references
   ================================================================ */
const $toggleForm = document.getElementById("btn-toggle-form");
const $toggleQr   = document.getElementById("btn-toggle-qr");
const $addForm    = document.getElementById("add-form");
const $qrPanel    = document.getElementById("qr-panel");
const $accounts   = document.getElementById("accounts");
const $empty      = document.getElementById("empty-state");
const $toast      = document.getElementById("toast");

// Manual form inputs
const $inputSvc   = document.getElementById("input-service");
const $inputLogin = document.getElementById("input-login");
const $inputKey   = document.getElementById("input-secret");
const $btnSave    = document.getElementById("btn-save");

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
const $ctxMove     = document.getElementById("ctx-move");
const $ctxDelete   = document.getElementById("ctx-delete");
let activeCardId   = null;

// Settings panel references
const $toggleSettings = document.getElementById("btn-toggle-settings");
const $settingsPanel  = document.getElementById("settings-panel");
const $colorDots      = document.querySelectorAll(".color-dot");
const $settingPrivacy = document.getElementById("setting-privacy");
const $settingClearClipboard = document.getElementById("setting-clear-clipboard");
const $btnBackupExport = document.getElementById("btn-backup-export");
const $btnBackupImportTrigger = document.getElementById("btn-backup-import-trigger");
const $inputBackupFile = document.getElementById("input-backup-file");

// Search elements references
const $inputSearch    = document.getElementById("input-search");
const $btnSearchClear = document.getElementById("btn-search-clear");

/* ================================================================
   Toast
   ================================================================ */
let toastTimer = null;

function showToast(msg, type = "success") {
  clearTimeout(toastTimer);
  $toast.textContent = msg;
  $toast.className = `toast toast--visible toast--${type}`;
  toastTimer = setTimeout(() => {
    $toast.classList.remove("toast--visible");
  }, 2400);
}

/* ================================================================
   Robust Clipboard Copying Helper
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
    // Fallback method using temporary textarea
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
    triggerClipboardClearTimer(text);
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
  resetQrPreview();
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
  }
});

/* ================================================================
   Save handler (Manual)
   ================================================================ */
$btnSave.addEventListener("click", async () => {
  [$inputSvc, $inputLogin, $inputKey].forEach((el) =>
    el.classList.remove("add-form__input--error")
  );

  const service = $inputSvc.value.trim();
  const login   = $inputLogin.value.trim();
  const secret  = $inputKey.value.trim().replace(/\s+/g, "");

  let hasError = false;
  if (!service) { $inputSvc.classList.add("add-form__input--error"); hasError = true; }
  if (!login)   { $inputLogin.classList.add("add-form__input--error"); hasError = true; }
  if (!secret)  { $inputKey.classList.add("add-form__input--error"); hasError = true; }

  if (hasError) {
    showToast("Заполните все поля", "error");
    return;
  }

  if (!isValidBase32(secret)) {
    $inputKey.classList.add("add-form__input--error");
    showToast("Некорректный Base32 секретный ключ", "error");
    return;
  }

  try {
    await addAccount(service, login, secret);
    $inputSvc.value = "";
    $inputLogin.value = "";
    $inputKey.value = "";
    closeAllPanels();
    showToast("Аккаунт добавлен!");
    await renderAccounts();
  } catch (err) {
    console.error(err);
    showToast("Ошибка сохранения аккаунта", "error");
  }
});

/* ================================================================
   QR Import Handlers (File, Screen Capture, Clipboard Paste)
   ================================================================ */
let pendingQrAccounts = [];

// Helper to validate and render QR details
function handleRecognizedAccounts(accountList) {
  for (const acc of accountList) {
    if (!isValidBase32(acc.secret)) {
      throw new Error(`Секретный ключ для ${acc.service} не является корректным Base32`);
    }
  }

  pendingQrAccounts = accountList;
  $qrPreviewList.innerHTML = "";

  accountList.forEach(acc => {
    const item = document.createElement("div");
    item.className = "qr-preview__detail";
    item.style.marginBottom = "6px";
    item.style.borderBottom = "1px solid rgba(255,255,255,0.03)";
    item.style.paddingBottom = "4px";

    const maskedSecret = acc.secret.slice(0, 6) + "..." + acc.secret.slice(-4);
    const algoStr = `${acc.algorithm}, ${acc.digits} dig, ${acc.period}s`;

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
  title.textContent = count === 1 ? "Recognized Account Info:" : `Recognized Accounts (${count}):`;

  $qrPreview.classList.remove("qr-preview--hidden");
  showToast(count === 1 ? "QR-код успешно считан!" : `Найдено аккаунтов для импорта: ${count}`);
}

// Shared decoder file reader
async function handleQrFile(fileOrBlob) {
  try {
    showToast("Чтение QR-кода...", "success");
    const accountList = await decodeQrCode(fileOrBlob);
    handleRecognizedAccounts(accountList);
  } catch (err) {
    console.error(err);
    showToast(err.message || "Ошибка считывания QR-кода", "error");
    resetQrPreview();
  }
}

// 1. File Upload Selector
$qrFileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (file) {
    await handleQrFile(file);
  }
  $qrFileInput.value = "";
});

// 2. Scan Screen Capture
$btnQrScreen.addEventListener("click", async () => {
  try {
    showToast("Делаем скриншот вкладки...", "success");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab) {
        showToast("Не найдена активная вкладка", "error");
        return;
      }
      chrome.tabs.captureVisibleTab(activeTab.windowId, { format: "png" }, async (dataUrl) => {
        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message || "";
          console.error("Capture error:", errMsg);
          showToast("Ошибка: " + errMsg, "error");
          return;
        }
        if (!dataUrl) {
          showToast("Скриншот пуст", "error");
          return;
        }

        // Save screenshot to local storage
        chrome.storage.local.set({ tempScreenshot: dataUrl }, () => {
          // Open the crop tab
          chrome.tabs.create({ url: "crop.html" }, () => {
            // Close the popup so the user can interact with the crop tab
            window.close();
          });
        });
      });
    });
  } catch (err) {
    console.error(err);
    showToast("Сбой захвата экрана", "error");
  }
});

// 3. Paste Clipboard Image click trigger
$btnQrPaste.addEventListener("click", async () => {
  try {
    const clipboardItems = await navigator.clipboard.read();
    for (const item of clipboardItems) {
      for (const type of item.types) {
        if (type.startsWith("image/")) {
          const blob = await item.getType(type);
          await handleQrFile(blob);
          return;
        }
      }
    }
    showToast("В буфере обмена нет изображений", "error");
  } catch (err) {
    console.warn(err);
    showToast("Используйте Ctrl+V для вставки картинки напрямую", "error");
  }
});

// 4. Ctrl+V Event Handler
document.addEventListener("paste", async (e) => {
  if (!qrOpen) return;
  const items = e.clipboardData.items;
  for (const item of items) {
    if (item.type.indexOf("image") !== -1) {
      const file = item.getAsFile();
      await handleQrFile(file);
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
        acc.algorithm
      );
    }
    showToast(pendingQrAccounts.length === 1 ? "Импортировано из QR!" : `Импортировано аккаунтов: ${pendingQrAccounts.length}`);
    closeAllPanels();
    await renderAccounts();
  } catch (err) {
    console.error(err);
    showToast("Ошибка сохранения аккаунт(ов)", "error");
  }
});

$btnQrCancel.addEventListener("click", () => {
  resetQrPreview();
  showToast("Импорт отменен");
});

function resetQrPreview() {
  pendingQrAccounts = [];
  $qrPreview.classList.add("qr-preview--hidden");
  $qrPreviewList.innerHTML = "";
}

/* ================================================================
   Render accounts
   ================================================================ */
const TIMER_CIRCUMFERENCE = 2 * Math.PI * 14; // radius = 14 in SVG

async function renderAccounts() {
  const accounts = await loadAccounts();
  $accounts.innerHTML = "";

  if (accounts.length === 0) {
    $empty.classList.remove("empty-state--hidden");
    return;
  }
  $empty.classList.add("empty-state--hidden");

  for (const acc of accounts) {
    let secret;
    try {
      secret = await decryptSecret(acc.secret);
    } catch (err) {
      console.error("Failed to decrypt secret for service: " + acc.service, err);
      continue; // skip corrupted
    }

    const period = acc.period || 30;
    const digits = acc.digits || 6;
    const algorithm = acc.algorithm || "SHA-1";

    let code = "ERROR";
    let isError = false;
    try {
      const rawCode = await generateTOTP(secret, period, digits, algorithm);
      code = formatCode(rawCode);
    } catch (err) {
      console.error("Failed to generate TOTP code for: " + acc.service, err);
      isError = true;
    }

    const secs = secondsRemaining(period);
    const fraction = secs / period;
    const dashoffset = TIMER_CIRCUMFERENCE * (1 - fraction);

    const card = document.createElement("div");
    card.className = "card";
    card.dataset.id = acc.id;
    card.dataset.period = period;

    const codeClass = appSettings.privacyMode ? "card__code card__code--hidden" : "card__code";

    card.innerHTML = `
      <div class="card__info">
        <div class="card__meta">
          <span class="card__service">${escapeHtml(acc.service)}</span>
          <span class="card__separator">:</span>
          <span class="card__login">${escapeHtml(acc.login)}</span>
        </div>
        <div class="${codeClass}" data-code>${escapeHtml(code)}</div>
      </div>
      <div class="card__right">
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
      </div>
    `;

    $accounts.appendChild(card);
  }
}

/* ================================================================
   Event Delegation for Copy & Delete actions
   ================================================================ */
$accounts.addEventListener("click", async (e) => {
  // Left click on card or code to copy the TOTP token
  const card = e.target.closest(".card");
  if (card) {
    e.preventDefault();
    e.stopPropagation();

    const codeEl = card.querySelector("[data-code]");
    const raw = codeEl.textContent.replace(/\s/g, "");

    if (raw === "ERROR") {
      showToast("Ошибка генерации кода", "error");
      return;
    }

    const success = await copyToClipboard(raw);
    if (success) {
      showToast("Код скопирован!");
    } else {
      showToast("Ошибка копирования", "error");
    }
  }
});

// Custom Right-Click Context Menu triggers
$accounts.addEventListener("contextmenu", (e) => {
  const card = e.target.closest(".card");
  if (card) {
    e.preventDefault();
    e.stopPropagation();
    activeCardId = card.dataset.id;

    // Show and position the context menu
    $contextMenu.classList.remove("context-menu--hidden");

    const menuWidth = 170;
    const menuHeight = 90;
    let x = e.clientX;
    let y = e.clientY;

    // Boundary check so context menu doesn't overflow popup
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

// Close context menu when clicking anywhere else
document.addEventListener("click", () => {
  $contextMenu.classList.add("context-menu--hidden");
});

// Handle Context Menu Actions
$ctxCopy.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!activeCardId) return;

  const card = document.querySelector(`.card[data-id="${activeCardId}"]`);
  if (card) {
    const codeEl = card.querySelector("[data-code]");
    const raw = codeEl.textContent.replace(/\s/g, "");

    if (raw === "ERROR") {
      showToast("Ошибка генерации кода", "error");
      return;
    }

    const success = await copyToClipboard(raw);
    if (success) {
      showToast("Код скопирован!");
    } else {
      showToast("Ошибка копирования", "error");
    }
  }
  $contextMenu.classList.add("context-menu--hidden");
});

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
      showToast("Аккаунт удален");
    }, { once: true });
  }
  $contextMenu.classList.add("context-menu--hidden");
});

/* ================================================================
   Live tick loop – updates timers & codes every second per account
   ================================================================ */
let tickInterval = null;

async function tick() {
  let needsReRender = false;

  document.querySelectorAll(".card").forEach((card) => {
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
   Settings handling
   ================================================================ */
const SETTINGS_KEY = "app_settings";
let appSettings = {
  accentColor: "white",
  privacyMode: false,
  clearClipboardSec: 30
};

async function loadAppSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(SETTINGS_KEY, (result) => {
      const saved = result[SETTINGS_KEY] || {};
      appSettings = {
        accentColor: saved.accentColor || "white",
        privacyMode: saved.privacyMode !== undefined ? saved.privacyMode : false,
        clearClipboardSec: saved.clearClipboardSec !== undefined ? parseInt(saved.clearClipboardSec, 10) : 30
      };
      resolve(appSettings);
    });
  });
}

async function saveAppSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [SETTINGS_KEY]: appSettings }, resolve);
  });
}

const ACCENT_COLOR_MAP = {
  white: { accent: "#ffffff", hover: "#e0e0e0", glow: "rgba(255, 255, 255, 0.12)" },
  green: { accent: "#3ecf8e", hover: "#4de09e", glow: "rgba(62, 207, 142, 0.12)" },
  blue: { accent: "#1a73e8", hover: "#3b82f6", glow: "rgba(26, 115, 232, 0.12)" },
  purple: { accent: "#a855f7", hover: "#c084fc", glow: "rgba(168, 85, 247, 0.12)" },
  orange: { accent: "#f97316", hover: "#fb923c", glow: "rgba(249, 115, 22, 0.12)" }
};

function applyAccentColor(colorName) {
  const vars = ACCENT_COLOR_MAP[colorName] || ACCENT_COLOR_MAP.white;
  document.documentElement.style.setProperty("--accent", vars.accent);
  document.documentElement.style.setProperty("--accent-hover", vars.hover);
  document.documentElement.style.setProperty("--accent-glow", vars.glow);

  $colorDots.forEach(dot => {
    if (dot.dataset.color === colorName) {
      dot.classList.add("color-dot--active");
    } else {
      dot.classList.remove("color-dot--active");
    }
  });
}

function populateSettingsUI() {
  $settingPrivacy.checked = appSettings.privacyMode;
  $settingClearClipboard.value = appSettings.clearClipboardSec.toString();
  applyAccentColor(appSettings.accentColor);
}

// Clipboard auto-clear helper
let clipboardClearTimeout = null;

function triggerClipboardClearTimer(copiedText) {
  clearTimeout(clipboardClearTimeout);
  if (appSettings.clearClipboardSec <= 0) return;

  clipboardClearTimeout = setTimeout(async () => {
    try {
      await navigator.clipboard.writeText("");
      showToast("Буфер обмена очищен", "success");
    } catch (err) {
      console.error("Failed to clear clipboard:", err);
    }
  }, appSettings.clearClipboardSec * 1000);
}

// Event Listeners for Settings Options
$colorDots.forEach(dot => {
  dot.addEventListener("click", async () => {
    const color = dot.dataset.color;
    appSettings.accentColor = color;
    applyAccentColor(color);
    await saveAppSettings();
    showToast("Акцентный цвет изменен");
  });
});

$settingPrivacy.addEventListener("change", async (e) => {
  appSettings.privacyMode = e.target.checked;
  await saveAppSettings();
  await renderAccounts();
  showToast(appSettings.privacyMode ? "Режим приватности включен" : "Режим приватности выключен");
});

$settingClearClipboard.addEventListener("change", async (e) => {
  appSettings.clearClipboardSec = parseInt(e.target.value, 10);
  await saveAppSettings();
  showToast("Время автоочистки буфера обновлено");
});

// Backup Export Logic
$btnBackupExport.addEventListener("click", async () => {
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
          algorithm: acc.algorithm || "SHA-1"
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
    showToast("Резервная копия скачана");
  } catch (err) {
    console.error("Backup export error:", err);
    showToast("Ошибка экспорта бэкапа", "error");
  }
});

// Backup Import Logic
$btnBackupImportTrigger.addEventListener("click", () => {
  $inputBackupFile.click();
});

$inputBackupFile.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.source !== "OnePass Auth Backup" || !Array.isArray(data.accounts)) {
          showToast("Некорректный файл бэкапа", "error");
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
            acc.algorithm || "SHA-1"
          );
          importedCount++;
        }

        if (importedCount > 0) {
          showToast(`Импортировано: ${importedCount} аккаунтов`);
          await renderAccounts();
        } else {
          showToast("Все аккаунты из бэкапа уже добавлены");
        }
      } catch (err) {
        console.error("Failed to parse JSON backup:", err);
        showToast("Ошибка чтения файла", "error");
      }
    };
    reader.readAsText(file);
  } catch (err) {
    console.error("Backup import file error:", err);
    showToast("Ошибка импорта файла", "error");
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

  filterAccounts(query);
});

$btnSearchClear.addEventListener("click", () => {
  $inputSearch.value = "";
  $btnSearchClear.classList.add("search-bar__clear--hidden");
  filterAccounts("");
  $inputSearch.focus();
});

function filterAccounts(query) {
  const cards = document.querySelectorAll(".card");
  cards.forEach((card) => {
    const service = (card.querySelector(".card__service")?.textContent || "").toLowerCase();
    const login = (card.querySelector(".card__login")?.textContent || "").toLowerCase();
    
    if (service.includes(query) || login.includes(query)) {
      card.style.display = "";
    } else {
      card.style.display = "none";
    }
  });
}

/* ================================================================
   Horizontal Scroll on Hover for Long Texts
   ================================================================ */
let activeScrollIntervals = new Map();

function startHorizontalScroll(element) {
  stopHorizontalScroll(element);
  const limit = element.scrollWidth - element.clientWidth;
  if (limit <= 0) return;

  let dir = 1;
  let pauseTicks = 0;

  const interval = setInterval(() => {
    if (pauseTicks > 0) {
      pauseTicks--;
      return;
    }

    if (dir === 1) {
      element.scrollLeft += 1;
      if (element.scrollLeft >= limit) {
        dir = -1;
        pauseTicks = 40; // Approx 1s pause
      }
    } else {
      element.scrollLeft -= 1;
      if (element.scrollLeft <= 0) {
        dir = 1;
        pauseTicks = 40;
      }
    }
  }, 25);

  activeScrollIntervals.set(element, interval);
}

function stopHorizontalScroll(element) {
  if (activeScrollIntervals.has(element)) {
    clearInterval(activeScrollIntervals.get(element));
    activeScrollIntervals.delete(element);
  }
  element.scrollTo({ left: 0, behavior: "smooth" });
}

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
   Drag & Drop holding reordering
   ================================================================ */
let dragTimeout = null;
let isDragging = false;
let dragEl = null;
let startClientY = 0;
let originalIndex = -1;

$accounts.addEventListener("mousedown", onDragStart);
$accounts.addEventListener("touchstart", onDragStart, { passive: false });

function onDragStart(e) {
  if (e.type === "mousedown" && e.button !== 0) return;
  
  const card = e.target.closest(".card");
  if (!card) return;

  if (e.target.closest(".card__timer") || e.target.closest(".card__actions") || e.target.closest(".context-menu")) return;

  const clientY = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;
  const clientX = e.type === "touchstart" ? e.touches[0].clientX : e.clientX;

  dragTimeout = setTimeout(() => {
    startDrag(card, clientY, clientX);
  }, 250); // 250ms hold

  const cancelDragHold = () => {
    clearTimeout(dragTimeout);
    document.removeEventListener("mouseup", cancelDragHold);
    document.removeEventListener("touchend", cancelDragHold);
    document.removeEventListener("mousemove", checkMoveBeforeHold);
    document.removeEventListener("touchmove", checkMoveBeforeHold);
  };

  const checkMoveBeforeHold = (event) => {
    const currentY = event.type === "touchmove" ? event.touches[0].clientY : event.clientY;
    const currentX = event.type === "touchmove" ? event.touches[0].clientX : event.clientX;
    if (Math.abs(currentY - clientY) > 5 || Math.abs(currentX - clientX) > 5) {
      clearTimeout(dragTimeout);
    }
  };

  document.addEventListener("mouseup", cancelDragHold);
  document.addEventListener("touchend", cancelDragHold);
  document.addEventListener("mousemove", checkMoveBeforeHold);
  document.addEventListener("touchmove", checkMoveBeforeHold);
}

function startDrag(card, clientY, clientX) {
  isDragging = true;
  dragEl = card;
  startClientY = clientY;
  originalIndex = Array.from($accounts.children).indexOf(card);

  dragEl.classList.add("card--dragging");
  dragEl.style.transform = "scale(1.03)";

  if (navigator.vibrate) {
    navigator.vibrate(50);
  }

  if (clientX === undefined) {
    document.addEventListener("touchmove", onDragMove, { passive: false });
    document.addEventListener("touchend", onDragEnd);
  } else {
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", onDragEnd);
  }
}

function onDragMove(e) {
  if (!isDragging || !dragEl) return;
  if (e.cancelable) e.preventDefault();

  const clientY = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;
  const deltaY = clientY - startClientY;

  dragEl.style.transform = `translateY(${deltaY}px) scale(1.03)`;

  const rect = dragEl.getBoundingClientRect();
  const dragCenterY = rect.top + rect.height / 2;
  const dragCenterX = rect.left + rect.width / 2;

  dragEl.style.visibility = "hidden";
  const elemBelow = document.elementFromPoint(dragCenterX, dragCenterY);
  dragEl.style.visibility = "visible";

  if (!elemBelow) return;
  const targetCard = elemBelow.closest(".card");

  if (targetCard && targetCard !== dragEl) {
    const targetRect = targetCard.getBoundingClientRect();
    const targetCenterY = targetRect.top + targetRect.height / 2;

    if (clientY > targetCenterY && dragEl.nextElementSibling === targetCard) {
      animateReorder($accounts, dragEl, targetCard.nextElementSibling);
      startClientY = clientY;
      dragEl.style.transform = "translateY(0px) scale(1.03)";
    } else if (clientY < targetCenterY && dragEl.previousElementSibling === targetCard) {
      animateReorder($accounts, dragEl, targetCard);
      startClientY = clientY;
      dragEl.style.transform = "translateY(0px) scale(1.03)";
    }
  }
}

async function onDragEnd() {
  if (!isDragging) return;
  isDragging = false;

  document.removeEventListener("mousemove", onDragMove);
  document.removeEventListener("mouseup", onDragEnd);
  document.removeEventListener("touchmove", onDragMove);
  document.removeEventListener("touchend", onDragEnd);

  dragEl.classList.remove("card--dragging");
  dragEl.style.transform = "";
  
  const finalIndex = Array.from($accounts.children).indexOf(dragEl);
  if (finalIndex !== originalIndex) {
    await reorderAccountsInStorage(originalIndex, finalIndex);
    showToast("Порядок аккаунтов изменен");
  }

  dragEl = null;
}

function animateReorder(parent, dragging, beforeNode) {
  const children = Array.from(parent.children).filter(c => c !== dragging);
  
  const firstPositions = children.map(c => ({
    el: c,
    rect: c.getBoundingClientRect()
  }));

  parent.insertBefore(dragging, beforeNode);

  firstPositions.forEach(pos => {
    const lastRect = pos.el.getBoundingClientRect();
    const invertY = pos.rect.top - lastRect.top;
    
    if (invertY !== 0) {
      pos.el.style.transition = 'none';
      pos.el.style.transform = `translateY(${invertY}px)`;
      pos.el.offsetHeight;
      pos.el.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)';
      pos.el.style.transform = 'translateY(0)';
    }
  });
}

async function reorderAccountsInStorage(fromIndex, fromTargetIndex) {
  const accounts = await loadAccounts();
  const moved = accounts.splice(fromIndex, 1)[0];
  accounts.splice(fromTargetIndex, 0, moved);
  await saveAccounts(accounts);
}

/* ================================================================
   Move Mode (Keyboard Reordering)
   ================================================================ */
let isReorderingMode = false;
let reorderEl = null;
let reorderOriginalIndex = -1;

function startReorderMode(card) {
  if (isReorderingMode) return;
  isReorderingMode = true;
  reorderEl = card;
  reorderOriginalIndex = Array.from($accounts.children).indexOf(card);

  $accounts.classList.add("accounts--reordering");
  reorderEl.classList.add("card--reordering");

  document.addEventListener("keydown", onReorderKeyDown);
  document.addEventListener("click", onReorderClick, { capture: true });

  showToast("Режим перемещения. Используйте стрелки ↑/↓.", "success");
}

async function stopReorderMode() {
  if (!isReorderingMode) return;
  isReorderingMode = false;

  document.removeEventListener("keydown", onReorderKeyDown);
  document.removeEventListener("click", onReorderClick, { capture: true });

  $accounts.classList.remove("accounts--reordering");
  if (reorderEl) {
    reorderEl.classList.remove("card--reordering");
    reorderEl.style.transform = "";
  }

  const finalIndex = Array.from($accounts.children).indexOf(reorderEl);
  if (finalIndex !== reorderOriginalIndex) {
    await reorderAccountsInStorage(reorderOriginalIndex, finalIndex);
    showToast("Порядок аккаунтов сохранен");
  }

  reorderEl = null;
}

function onReorderKeyDown(e) {
  if (!isReorderingMode || !reorderEl) return;

  if (e.key === "ArrowUp") {
    e.preventDefault();
    const prev = reorderEl.previousElementSibling;
    if (prev && prev.classList.contains("card")) {
      animateReorder($accounts, reorderEl, prev);
      reorderEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    const next = reorderEl.nextElementSibling;
    if (next && next.classList.contains("card")) {
      animateReorder($accounts, reorderEl, next.nextElementSibling);
      reorderEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  } else if (e.key === "Enter" || e.key === "Escape") {
    e.preventDefault();
    stopReorderMode();
  }
}

function onReorderClick(e) {
  e.preventDefault();
  e.stopPropagation();
  stopReorderMode();
}

/* ================================================================
   Boot
   ================================================================ */
(async () => {
  await loadAppSettings();
  populateSettingsUI();
  await renderAccounts();
  tickInterval = setInterval(tick, 1000);
})();
