// crop.js - Controller for the full-screen selection cropping page

import { addAccount } from './storage.js';
import { parseOtpauthUrl } from './qr.js';
import { isValidBase32 } from './totp.js';
import { initTranslations, getTranslation } from './i18n.js';

const $canvas = document.getElementById("screenshot-canvas");
const ctx = $canvas.getContext("2d");
const $toast = document.getElementById("toast");
const $instructionOverlay = document.getElementById("instruction-overlay");
const $btnStart = document.getElementById("btn-start");
const $btnCancel = document.getElementById("btn-cancel");

let img = new Image();
let isDrawing = false;
let startX = 0;
let startY = 0;
let endX = 0;
let endY = 0;
let canvasWidth = window.innerWidth;
let canvasHeight = window.innerHeight;

// Toast Helper
let toastTimer = null;
function showToast(msg, type = "error") {
  clearTimeout(toastTimer);
  $toast.textContent = msg;
  $toast.className = `toast toast--visible toast--${type}`;
  toastTimer = setTimeout(() => {
    $toast.classList.remove("toast--visible");
  }, 3000);
}

// Initial setup
async function init() {
  initTranslations();
  
  // Load the temporary screenshot taken by popup
  const data = await chrome.storage.local.get("tempScreenshot");
  if (!data.tempScreenshot) {
    showToast(getTranslation("crop_toast_no_screenshot"), "error");
    setTimeout(() => window.close(), 2500);
    return;
  }

  img.onload = () => {
    setupCanvas();
  };
  img.src = data.tempScreenshot;
}

// Handle window resizing
window.addEventListener("resize", () => {
  if (img.src) {
    setupCanvas();
  }
});

function setupCanvas() {
  canvasWidth = window.innerWidth;
  canvasHeight = window.innerHeight;
  $canvas.width = canvasWidth;
  $canvas.height = canvasHeight;

  // Draw the full screenshot to canvas
  drawScene();
}

function drawScene() {
  // 1. Draw base image
  ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

  // 2. Draw dimming overlay
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // If drawing selection, clear out the rectangle and draw borders
  if (isDrawing || (startX !== endX && startY !== endY)) {
    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const w = Math.abs(startX - endX);
    const h = Math.abs(startY - endY);

    if (w > 0 && h > 0) {
      // Clear overlay for selected region (restore original image visibility)
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
      ctx.restore();

      // Draw border around selection
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]); // dashed border
      ctx.strokeRect(x, y, w, h);

      // Draw subtle glow
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 4;
      ctx.setLineDash([]);
      ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
    }
  }
}

// Mouse events
$canvas.addEventListener("mousedown", (e) => {
  // Only draw if instructions overlay is gone
  if ($instructionOverlay.style.display === "none" || $instructionOverlay.style.opacity === "0") {
    isDrawing = true;
    startX = e.clientX;
    startY = e.clientY;
    endX = e.clientX;
    endY = e.clientY;
    drawScene();
  }
});

$canvas.addEventListener("mousemove", (e) => {
  if (isDrawing) {
    endX = e.clientX;
    endY = e.clientY;
    drawScene();
  }
});

$canvas.addEventListener("mouseup", async (e) => {
  if (isDrawing) {
    isDrawing = false;
    endX = e.clientX;
    endY = e.clientY;

    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const w = Math.abs(startX - endX);
    const h = Math.abs(startY - endY);

    if (w > 8 && h > 8) {
      await processCrop(x, y, w, h);
    } else {
      // Clear selection if it's too small
      startX = 0;
      startY = 0;
      endX = 0;
      endY = 0;
      drawScene();
    }
  }
});

// Process cropped region to scan QR
async function processCrop(x, y, w, h) {
  // Use temporary off-screen canvas to get cropped image data
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = w;
  cropCanvas.height = h;
  const cropCtx = cropCanvas.getContext("2d");

  // Calculate coordinates relative to actual screenshot resolution
  const scaleX = img.naturalWidth / canvasWidth;
  const scaleY = img.naturalHeight / canvasHeight;

  const sourceX = x * scaleX;
  const sourceY = y * scaleY;
  const sourceW = w * scaleX;
  const sourceH = h * scaleY;

  cropCtx.drawImage(
    img,
    sourceX, sourceY, sourceW, sourceH, // source rect
    0, 0, w, h                          // dest rect
  );

  const imageData = cropCtx.getImageData(0, 0, w, h);
  const code = jsQR(imageData.data, imageData.width, imageData.height);

  if (!code) {
    showToast(getTranslation("crop_toast_no_qr"), "error");
    // Clear selection for retry
    startX = 0;
    startY = 0;
    endX = 0;
    endY = 0;
    drawScene();
    return;
  }

  // QR code found! Decode and import
  try {
    const accountList = parseOtpauthUrl(code.data);
    
    if (!accountList || accountList.length === 0) {
      showToast(getTranslation("crop_toast_invalid_qr"), "error");
      return;
    }

    for (const acc of accountList) {
      if (!isValidBase32(acc.secret)) {
        throw new Error(getTranslation("crop_toast_invalid_key", acc.service));
      }
    }

    // Save to storage
    for (const acc of accountList) {
      await addAccount(
        acc.service,
        acc.login,
        acc.secret,
        acc.period,
        acc.digits,
        acc.algorithm,
        acc.type || "totp",
        acc.counter || 0
      );
    }

    // Clear temp storage
    await chrome.storage.local.remove("tempScreenshot");

    // Show success
    const count = accountList.length;
    showToast(
      count === 1 
        ? getTranslation("crop_toast_imported_success") 
        : getTranslation("crop_toast_imported_count", count), 
      "success"
    );

    // Close the page shortly
    setTimeout(() => {
      window.close();
    }, 1200);

  } catch (err) {
    console.error("Import error:", err);
    showToast(err.message || getTranslation("crop_toast_import_error"), "error");
  }
}

// UI controls
$btnStart.addEventListener("click", () => {
  $instructionOverlay.style.opacity = "0";
  setTimeout(() => {
    $instructionOverlay.style.display = "none";
  }, 500);
});

$btnCancel.addEventListener("click", async () => {
  await chrome.storage.local.remove("tempScreenshot");
  window.close();
});

// Start the initialization
init();
