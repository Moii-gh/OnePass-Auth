/**
 * i18n.js - Helper to translate UI elements using data-i18n attributes and localized messages.
 * Separates tag text translations from attribute tooltips to protect SVG structures.
 */

const FALLBACK_MAP = {
  "extension_name": "OnePass Auth",
  "panel_title_manual": "Manual Import",
  "panel_title_edit": "Edit Account",
  "panel_title_qr": "Import QR-code",
  "panel_title_settings": "Settings",
  "input_placeholder_service": "Service name (e.g. Google)",
  "input_placeholder_login": "Login / email",
  "input_placeholder_secret": "Secret key (Base32)",
  "btn_add_account": "Add account",
  "btn_save_changes": "Save changes",
  "btn_scan_screen": "Scan Screen",
  "btn_paste_image": "Paste Image",
  "dropzone_text": "Or choose QR image file",
  "dropzone_subtext": "(PNG, JPG, WebP)",
  "qr_preview_title": "Recognized Account Info:",
  "btn_qr_confirm": "Confirm & Save",
  "btn_qr_cancel": "Cancel",
  "settings_theme_accent": "Theme Accent Color",
  "settings_theme_mode": "App Theme",
  "theme_dark": "Dark Mode",
  "theme_light": "Light Mode",
  "settings_privacy_mode": "Privacy Mode (Hide codes)",
  "settings_pin_lock": "PIN Lock Protection",
  "settings_clear_clipboard": "Auto-Clear Clipboard",
  "clipboard_never": "Never",
  "clipboard_10s": "After 10 seconds",
  "clipboard_30s": "After 30 seconds",
  "clipboard_60s": "After 60 seconds",
  "settings_backup": "Data Backup",
  "btn_backup_export": "Export",
  "btn_backup_import": "Import",
  "search_placeholder": "Search accounts...",
  "empty_state_text": "No accounts yet",
  "empty_state_hint": "Add manually or import via QR-code above",
  "ctx_copy": "Copy code",
  "ctx_edit": "Edit account",
  "ctx_move": "Move",
  "ctx_delete": "Delete account",
  "lock_title": "OnePass Auth Locked",
  "pin_setup_title": "Set New PIN",
  "pin_confirm_title": "Confirm New PIN",
  "pin_enter_current": "Enter Current PIN",
  "category_all": "All",
  "category_personal": "Personal",
  "category_work": "Work",
  "category_finance": "Finance",
  "category_social": "Social",
  "category_other": "Other",
  "category_none": "No category",
  "category_create_new": "+ Create new category...",
  "settings_categories": "Custom Categories",
  "placeholder_new_category": "New category name...",
  "toast_category_added": "Category added",
  "toast_category_deleted": "Category deleted",
  "toast_category_exists": "Category already exists",
  "toast_category_empty": "Please enter a category name",
  
  // Tooltip descriptions
  "panel_title_qr_title": "Import from QR",
  "panel_title_manual_title": "Add account manually",
  "panel_title_settings_title": "Settings",
  "btn_scan_screen_title": "Scan QR directly from current page/tab screen",
  "btn_paste_image_title": "Paste QR image from clipboard",
  
  // Toast translations fallbacks
  "toast_fill_fields": "Please fill all fields correctly",
  "toast_invalid_base32": "Invalid Base32 secret key",
  "toast_account_added": "Account added!",
  "toast_save_error": "Error saving account",
  "toast_link_parsed": "Data recognized from link!",
  "toast_secret_invalid_name": "Secret key for $1 is not valid Base32",
  "toast_qr_scanned": "QR code scanned successfully!",
  "toast_accounts_found": "Found accounts to import: $1",
  "toast_reading_qr": "Reading QR code...",
  "toast_no_active_tab": "Active tab not found",
  "toast_screenshot_empty": "Screenshot is empty",
  "toast_capture_failed": "Screen capture failed",
  "toast_no_clipboard_images": "No images in clipboard",
  "toast_use_ctrl_v": "Use Ctrl+V to paste image directly",
  "toast_imported_qr": "Imported from QR!",
  "toast_imported_count": "Imported accounts: $1",
  "toast_save_error_multi": "Error saving account(s)",
  "toast_import_cancelled": "Import cancelled",
  "toast_gen_error": "Error generating code",
  "toast_code_copied": "Code copied!",
  "toast_copy_error": "Error copying",
  "toast_code_updated": "Code updated!",
  "toast_update_error": "Error updating code",
  "toast_account_deleted": "Account deleted",
  "toast_accent_updated": "Accent color updated",
  "toast_privacy_enabled": "Privacy mode enabled",
  "toast_privacy_disabled": "Privacy mode disabled",
  "toast_clipboard_timer_updated": "Clipboard clear timer updated",
  "toast_backup_downloaded": "Backup downloaded",
  "toast_backup_export_error": "Backup export error",
  "toast_backup_invalid": "Invalid backup file",
  "toast_imported_backup_count": "Imported: $1 accounts",
  "toast_backup_all_added": "All accounts from backup already added",
  "toast_file_read_error": "Error reading file",
  "toast_file_import_error": "Error importing file",
  "toast_order_updated": "Account order updated",
  "toast_order_saved": "Account order saved",
  "toast_reorder_mode": "Reorder mode. Use ↑/↓ arrows.",
  "toast_clipboard_cleared": "Clipboard cleared",
  "toast_pin_mismatch": "PINs do not match!",
  "toast_pin_set": "PIN lock enabled",
  "toast_pin_disabled": "PIN lock disabled",
  "toast_pin_incorrect": "Incorrect PIN"
};

export function initTranslations() {
  // 1. Translate elements with data-i18n (text content / value / placeholders)
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const msg = getTranslation(key);
    if (!msg) return;

    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      if (el.hasAttribute("placeholder")) {
        el.placeholder = msg;
      } else {
        el.value = msg;
      }
    } else {
      // Safe replacement: since text is isolated in its own tag (like span or option),
      // we can safely set textContent without losing any SVG siblings!
      el.textContent = msg;
    }
  });

  // 2. Translate tooltips independently
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    const msg = getTranslation(key);
    if (msg) {
      el.setAttribute("title", msg);
    }
  });
}

export function getTranslation(key, substitutions = null) {
  if (substitutions !== null && !Array.isArray(substitutions)) {
    substitutions = [substitutions.toString()];
  }
  
  let msg = chrome.i18n.getMessage(key, substitutions);
  
  // Fallback if localization failed or empty
  if (!msg) {
    msg = FALLBACK_MAP[key] || "";
    if (msg && substitutions && substitutions.length > 0) {
      substitutions.forEach((sub, idx) => {
        msg = msg.replace(`$${idx + 1}`, sub);
      });
    }
  }
  
  return msg;
}
