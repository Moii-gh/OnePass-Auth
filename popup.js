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
const $ctxDelete   = document.getElementById("ctx-delete");
let activeCardId   = null;

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
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn("navigator.clipboard failed, using fallback", err);
  }

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
    return successful;
  } catch (err) {
    console.error("Fallback clipboard copy failed:", err);
    return false;
  }
}

/* ================================================================
   Toggle panels
   ================================================================ */
let formOpen = false;
let qrOpen = false;

function closeAllPanels() {
  formOpen = false;
  qrOpen = false;
  $addForm.classList.add("add-form--hidden");
  $qrPanel.classList.add("qr-panel--hidden");
  $toggleForm.classList.remove("header__btn--active");
  $toggleQr.classList.remove("header__btn--active");
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

        const img = new Image();
        img.onload = async function () {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);

            if (!code) {
              showToast("QR-код не найден на экране. Сделайте его крупнее на странице.", "error");
              return;
            }

            const accountList = parseOtpauthUrl(code.data);
            handleRecognizedAccounts(accountList);
          } catch (err) {
            console.error(err);
            showToast(err.message || "Ошибка распознавания с экрана", "error");
          }
        };
        img.onerror = function () {
          showToast("Ошибка обработки скриншота", "error");
        };
        img.src = dataUrl;
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

    card.innerHTML = `
      <div class="card__info">
        <div class="card__meta">
          <span class="card__service">${escapeHtml(acc.service)}</span>
          <span class="card__separator">:</span>
          <span class="card__login">${escapeHtml(acc.login)}</span>
        </div>
        <div class="card__code" data-code>${escapeHtml(code)}</div>
      </div>
      <div class="card__right">
        <div class="card__timer">
          <svg viewBox="0 0 36 36">
            <circle class="card__timer-bg" cx="18" cy="18" r="14"/>
            <circle class="card__timer-fg ${secs <= 5 ? 'card__timer-fg--warn' : ''}"
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
      if (secs <= 5) ring.classList.add("card__timer-fg--warn");
      else ring.classList.remove("card__timer-fg--warn");
    }

    const txt = card.querySelector("[data-timer-text]");
    if (txt) {
      txt.textContent = secs;
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
   Boot
   ================================================================ */
(async () => {
  await renderAccounts();
  tickInterval = setInterval(tick, 1000);
})();
