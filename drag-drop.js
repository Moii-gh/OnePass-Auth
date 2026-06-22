/**
 * drag-drop.js – Drag & Drop mouse/touch reordering and keyboard Move Mode for card items.
 */

import { loadAccounts, saveAccounts } from './storage.js';

let dragTimeout = null;
let isDragging = false;
let dragEl = null;
let startClientY = 0;
let originalIndex = -1;

let isReorderingMode = false;
let reorderEl = null;
let reorderOriginalIndex = -1;

let $accounts = null;
let showToastCallback = null;

const TIMER_CIRCUMFERENCE = 2 * Math.PI * 14;

export function initDragAndDrop(accountsContainer, toastFn) {
  $accounts = accountsContainer;
  showToastCallback = toastFn;

  $accounts.addEventListener("mousedown", onDragStart);
  $accounts.addEventListener("touchstart", onDragStart, { passive: false });
}

function onDragStart(e) {
  if (e.type === "mousedown" && e.button !== 0) return;
  if (isReorderingMode) return; // ignore drag during keyboard move mode
  
  const card = e.target.closest(".card");
  if (!card) return;

  if (e.target.closest(".card__timer") || e.target.closest(".card__btn-refresh") || e.target.closest(".context-menu")) return;

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
    if (showToastCallback) showToastCallback("toast_order_updated");
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
  // If we are currently filtering by category, the visual index on screen does not match storage index!
  // To handle this properly, let's load all accounts, map the visually moved account and target account
  // by their IDs, and swap them.
  const visualCards = Array.from($accounts.children);
  const accounts = await loadAccounts();
  
  // Find accounts in storage
  const visualIds = visualCards.map(c => c.dataset.id);
  const movedId = visualIds[fromTargetIndex];
  
  // Find index in storage
  const fromStorageIdx = accounts.findIndex(a => a.id === visualIds[fromIndex]);
  const targetStorageIdx = accounts.findIndex(a => a.id === movedId);
  
  if (fromStorageIdx !== -1 && targetStorageIdx !== -1) {
    const [moved] = accounts.splice(fromStorageIdx, 1);
    accounts.splice(targetStorageIdx, 0, moved);
    await saveAccounts(accounts);
  }
}

/* ================================================================
   Move Mode (Keyboard Reordering)
   ================================================================ */

export function startReorderMode(card) {
  if (isReorderingMode) return;
  isReorderingMode = true;
  reorderEl = card;
  reorderOriginalIndex = Array.from($accounts.children).indexOf(card);

  $accounts.classList.add("accounts--reordering");
  reorderEl.classList.add("card--reordering");

  document.addEventListener("keydown", onReorderKeyDown);
  document.addEventListener("click", onReorderClick, { capture: true });

  if (showToastCallback) showToastCallback("toast_reorder_mode", "success");
}

export async function stopReorderMode() {
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
    if (showToastCallback) showToastCallback("toast_order_saved");
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
