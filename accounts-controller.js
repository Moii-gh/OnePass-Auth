import { state, showToast, closeAllPanels, copyToClipboard } from './app-state.js';
import { 
  decryptSecret, isLocked 
} from './crypto.js';
import { 
  loadAccounts, incrementCounter, removeAccount, loadCustomCategories 
} from './storage.js';
import { 
  generateTOTP, generateHOTP, secondsRemaining 
} from './totp.js';
import { 
  getTranslation 
} from './i18n.js';
import { 
  startReorderMode 
} from './drag-drop.js';
import { 
  startHorizontalScroll, stopHorizontalScroll 
} from './ui.js';

/* ================================================================
   DOM references (Accounts specific)
   ================================================================ */
const $accounts          = document.getElementById("accounts");
const $empty             = document.getElementById("empty-state");
const $inputSearch       = document.getElementById("input-search");
const $btnSearchClear    = document.getElementById("btn-search-clear");
const $categoriesWrapper = document.getElementById("categories-wrapper");
const $contextMenu       = document.getElementById("context-menu");

// Context menu buttons
const $ctxCopy           = document.getElementById("ctx-copy");
const $ctxEdit           = document.getElementById("ctx-edit");
const $ctxMove           = document.getElementById("ctx-move");
const $ctxDelete         = document.getElementById("ctx-delete");
const $ctxQr             = document.getElementById("ctx-qr");

// Manual form elements (for editing action)
const $addForm           = document.getElementById("add-form");
const $addFormTitle      = document.getElementById("add-form-title");
const $toggleForm        = document.getElementById("btn-toggle-form");
const $inputSvc          = document.getElementById("input-service");
const $inputLogin        = document.getElementById("input-login");
const $inputKey          = document.getElementById("input-secret");
const $selectCategory    = document.getElementById("select-category");
const $btnSave           = document.getElementById("btn-save");

// QR Modal elements
const $qrModal           = document.getElementById("qr-modal");
const $qrModalTitle      = document.getElementById("qr-modal-title");
const $qrModalCode       = document.getElementById("qr-modal-code");
const $btnQrModalClose   = document.getElementById("btn-qr-modal-close");

const DEFAULT_CATEGORIES = [];
const TIMER_CIRCUMFERENCE = 2 * Math.PI * 14;

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
   Render Accounts List
   ================================================================ */
export async function renderAccounts() {
  if (await isLocked()) {
    const $lockScreen = document.getElementById("lock-screen");
    if ($lockScreen) $lockScreen.classList.remove("lock-screen--hidden");
    return;
  }

  const accounts = await loadAccounts();
  $accounts.innerHTML = "";

  const query = $inputSearch.value.trim().toLowerCase();
  const shownAccounts = accounts.filter(acc => {
    const belongsToCat = state.currentCategory === "all" || (acc.category || "none") === state.currentCategory;
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
    }

    const card = document.createElement("div");
    card.className = "card";
    card.dataset.id = acc.id;
    card.dataset.type = type;

    const codeClass = state.appSettings.privacyMode ? "card__code card__code--hidden" : "card__code";

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
   Render Categories Filter UI
   ================================================================ */
export async function renderCategoriesUI() {
  const customCats = await loadCustomCategories();
  const allCats = [...DEFAULT_CATEGORIES, ...customCats];

  const activeCategoryBefore = state.currentCategory;
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

  const optCreate = document.createElement("option");
  optCreate.value = "__create_new__";
  optCreate.textContent = getTranslation("category_create_new");
  optCreate.style.fontWeight = "bold";
  optCreate.style.color = "var(--accent)";
  $selectCategory.appendChild(optCreate);

  $selectCategory.value = selectedValBefore;
}

/* ================================================================
   Initialize Event Listeners
   ================================================================ */
export function initAccountsController() {
  // 1. Copy code click or increment counter click
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

  // 2. Custom Context Menu trigger
  $accounts.addEventListener("contextmenu", (e) => {
    const card = e.target.closest(".card");
    if (card) {
      e.preventDefault();
      e.stopPropagation();
      state.activeCardId = card.dataset.id;

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

  // 3. Copy Code from Context Menu
  $ctxCopy.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!state.activeCardId) return;

    const card = document.querySelector(`.card[data-id="${state.activeCardId}"]`);
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

  // 4. Edit Account from Context Menu
  $ctxEdit.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    $contextMenu.classList.add("context-menu--hidden");
    if (!state.activeCardId) return;

    const accounts = await loadAccounts();
    const acc = accounts.find(a => a.id === state.activeCardId);
    if (acc) {
      try {
        const plainSecret = await decryptSecret(acc.secret);
        $inputSvc.value = acc.service || "";
        $inputLogin.value = acc.login || "";
        $inputKey.value = plainSecret;
        $selectCategory.value = acc.category || "none";
        
        closeAllPanels();
        state.formOpen = true;
        $addForm.classList.remove("add-form--hidden");
        $toggleForm.classList.add("header__btn--active");
        
        $addFormTitle.textContent = getTranslation("panel_title_edit");
        $btnSave.textContent = getTranslation("btn_save_changes");
        state.editingId = state.activeCardId;
      } catch (err) {
        console.error(err);
        showToast("toast_file_read_error", "error");
      }
    }
  });

  // 5. Move/Reorder from Context Menu
  $ctxMove.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    $contextMenu.classList.add("context-menu--hidden");
    if (!state.activeCardId) return;

    const card = document.querySelector(`.card[data-id="${state.activeCardId}"]`);
    if (card) {
      setTimeout(() => {
        startReorderMode(card);
      }, 50);
    }
  });

  // 6. Delete Account from Context Menu
  $ctxDelete.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!state.activeCardId) return;

    const card = document.querySelector(`.card[data-id="${state.activeCardId}"]`);
    if (card) {
      const id = state.activeCardId;
      card.classList.add("card--removing");
      card.addEventListener("animationend", async () => {
        await removeAccount(id);
        await renderAccounts();
        showToast("toast_account_deleted");
      }, { once: true });
    }
    $contextMenu.classList.add("context-menu--hidden");
  });

  // 7. Show QR Code modal from Context Menu
  $ctxQr.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    $contextMenu.classList.add("context-menu--hidden");
    if (!state.activeCardId) return;

    const accounts = await loadAccounts();
    const acc = accounts.find(a => a.id === state.activeCardId);
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

        $qrModalTitle.textContent = `${service} (${login})`;
        $qrModalCode.innerHTML = "";
        new QRCode($qrModalCode, {
          text: otpauthUrl,
          width: 160,
          height: 160,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M
        });

        $qrModal.classList.remove("qr-modal--hidden");
      } catch (err) {
        console.error(err);
        showToast("toast_save_error", "error");
      }
    }
  });

  $btnQrModalClose.addEventListener("click", () => {
    $qrModal.classList.add("qr-modal--hidden");
  });

  $qrModal.addEventListener("click", (e) => {
    if (e.target === $qrModal) {
      $qrModal.classList.add("qr-modal--hidden");
    }
  });

  // 8. Horizontal scroll indicators for meta rows
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

  // 9. Search Bar input and clear buttons
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

  // 10. Category chips click delegation
  $categoriesWrapper.addEventListener("click", (e) => {
    const chip = e.target.closest(".category-chip");
    if (chip) {
      $categoriesWrapper.querySelectorAll(".category-chip").forEach(c => c.classList.remove("category-chip--active"));
      chip.classList.add("category-chip--active");
      state.currentCategory = chip.dataset.category;
      renderAccounts();
    }
  });
}
