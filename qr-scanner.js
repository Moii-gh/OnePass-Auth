/**
 * qr-scanner.js – Manages QR import options: Screen Capture, Dropzone files, and Clipboard pastes.
 */

import { decodeQrCode } from './qr.js';
import { isValidBase32 } from './totp.js';
import { getTranslation } from './i18n.js';

export async function scanFromFile(file, toastFn, confirmPreviewFn) {
  try {
    toastFn(getTranslation("toast_reading_qr"), "success");
    const accountList = await decodeQrCode(file);
    validateAndPreview(accountList, toastFn, confirmPreviewFn);
  } catch (err) {
    console.error(err);
    toastFn(err.message || getTranslation("toast_save_error_multi"), "error");
  }
}

export async function scanFromScreen(toastFn) {
  try {
    toastFn(getTranslation("toast_reading_qr"), "success");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab) {
        toastFn(getTranslation("toast_no_active_tab"), "error");
        return;
      }
      chrome.tabs.captureVisibleTab(activeTab.windowId, { format: "png" }, async (dataUrl) => {
        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message || "";
          console.error("Capture error:", errMsg);
          toastFn("Error: " + errMsg, "error");
          return;
        }
        if (!dataUrl) {
          toastFn(getTranslation("toast_screenshot_empty"), "error");
          return;
        }

        // Save screenshot to local storage
        chrome.storage.local.set({ tempScreenshot: dataUrl }, () => {
          chrome.tabs.create({ url: "crop.html" }, () => {
            window.close();
          });
        });
      });
    });
  } catch (err) {
    console.error(err);
    toastFn(getTranslation("toast_capture_failed"), "error");
  }
}

export async function scanFromClipboard(toastFn, confirmPreviewFn) {
  try {
    const clipboardItems = await navigator.clipboard.read();
    for (const item of clipboardItems) {
      for (const type of item.types) {
        if (type.startsWith("image/")) {
          const blob = await item.getType(type);
          toastFn(getTranslation("toast_reading_qr"), "success");
          const accountList = await decodeQrCode(blob);
          validateAndPreview(accountList, toastFn, confirmPreviewFn);
          return;
        }
      }
    }
    toastFn(getTranslation("toast_no_clipboard_images"), "error");
  } catch (err) {
    console.warn(err);
    toastFn(getTranslation("toast_use_ctrl_v"), "error");
  }
}

function validateAndPreview(accountList, toastFn, confirmPreviewFn) {
  for (const acc of accountList) {
    if (!isValidBase32(acc.secret)) {
      throw new Error(getTranslation("toast_secret_invalid_name", acc.service));
    }
  }
  confirmPreviewFn(accountList);
}
