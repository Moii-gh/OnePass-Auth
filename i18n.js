/**
 * i18n.js - Helper to translate UI elements.
 * Supports dynamic language switching with English and Russian dictionaries.
 */

const LANG_MAPS = {
  en: {
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
    "ctx_show_qr": "Show QR-code",
    "qr_modal_hint": "Scan with your phone's camera to import into an authenticator app",
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
    "panel_title_qr_title": "Import from QR",
    "panel_title_manual_title": "Add account manually",
    "panel_title_settings_title": "Settings",
    "btn_back": "Back",
    "btn_scan_screen_title": "Scan QR directly from current page/tab screen",
    "btn_paste_image_title": "Paste QR image from clipboard",
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
    "toast_pin_incorrect": "Incorrect PIN",
    "crop_title": "OnePass Auth – Select scanning area",
    "crop_header_text": "Draw a border around the QR code",
    "crop_cancel": "Cancel",
    "crop_instruction_title": "OnePass Auth – QR Scan",
    "crop_instruction_desc": "Hold down the left mouse button and select the QR code on the screen",
    "crop_instruction_start": "Start Selection",
    "crop_toast_no_screenshot": "Screenshot not found. Please open the extension and try again.",
    "crop_toast_no_qr": "QR code not found in the selected area. Please try again.",
    "crop_toast_invalid_qr": "Invalid QR code data",
    "crop_toast_invalid_key": "Secret key for $1 is incorrect",
    "crop_toast_imported_success": "Account imported successfully!",
    "crop_toast_imported_count": "Imported accounts: $1",
    "crop_toast_import_error": "Error importing account",
    "settings_language": "App Language",
    "lang_auto": "System Default",
    "lang_en": "English",
    "lang_ru": "Русский"
  },
  ru: {
    "extension_name": "OnePass Auth",
    "panel_title_manual": "Ручной импорт",
    "panel_title_edit": "Редактировать аккаунт",
    "panel_title_qr": "Импорт QR-кода",
    "panel_title_settings": "Настройки",
    "panel_title_qr_title": "Импорт из QR-кода",
    "panel_title_manual_title": "Добавить вручную",
    "panel_title_settings_title": "Настройки",
    "btn_back": "Назад",
    "input_placeholder_service": "Название сервиса (например, Google)",
    "input_placeholder_login": "Логин / email",
    "input_placeholder_secret": "Секретный ключ (Base32)",
    "btn_add_account": "Добавить аккаунт",
    "btn_save_changes": "Сохранить изменения",
    "btn_scan_screen": "Сканировать экран",
    "btn_scan_screen_title": "Сканировать QR-код прямо с экрана текущей страницы",
    "btn_paste_image": "Вставить из буфера",
    "btn_paste_image_title": "Вставить картинку QR-кода из буфера обмена",
    "dropzone_text": "Или выберите файл с QR-кодом",
    "dropzone_subtext": "(PNG, JPG, WebP)",
    "qr_preview_title": "Информация о распознанном аккаунте:",
    "btn_qr_confirm": "Подтвердить и сохранить",
    "btn_qr_cancel": "Отмена",
    "settings_theme_accent": "Акцентный цвет темы",
    "settings_privacy_mode": "Режим приватности (скрывать коды)",
    "settings_clear_clipboard": "Автоочистка буфера обмена",
    "clipboard_never": "Никогда",
    "clipboard_10s": "Через 10 секунд",
    "clipboard_30s": "Через 30 секунд",
    "clipboard_60s": "Через 60 секунд",
    "settings_backup": "Резервное копирование",
    "btn_backup_export": "Экспорт",
    "btn_backup_import": "Импорт",
    "search_placeholder": "Поиск аккаунтов...",
    "empty_state_text": "Нет добавленных аккаунтов",
    "empty_state_hint": "Добавьте вручную или импортируйте через QR-код выше",
    "ctx_copy": "Копировать код",
    "ctx_edit": "Редактировать аккаунт",
    "ctx_move": "Переместить",
    "ctx_delete": "Удалить аккаунт",
    "ctx_show_qr": "Показать QR-код",
    "qr_modal_hint": "Отсканируйте камерой телефона для импорта в приложение аутентификации",
    "crop_title": "OnePass Auth – Выбор области сканирования",
    "crop_header_text": "Выделите рамкой область с QR-кодом",
    "crop_cancel": "Отмена",
    "crop_instruction_title": "OnePass Auth – Сканирование QR",
    "crop_instruction_desc": "Зажмите левую кнопку мыши и выделите прямоугольником QR-код на экране",
    "crop_instruction_start": "Начать выделение",
    "toast_fill_fields": "Заполните все поля корректно",
    "toast_invalid_base32": "Некорректный Base32 секретный ключ",
    "toast_account_added": "Аккаунт добавлен!",
    "toast_save_error": "Ошибка сохранения аккаунта",
    "toast_link_parsed": "Данные распознаны из ссылки!",
    "toast_secret_invalid_name": "Секретный ключ для $1 не является корректным Base32",
    "toast_qr_scanned": "QR-код успешно считан!",
    "toast_accounts_found": "Найдено аккаунтов для импорта: $1",
    "toast_reading_qr": "Чтение QR-кода...",
    "toast_no_active_tab": "Не найдена активная вкладка",
    "toast_screenshot_empty": "Скриншот пуст",
    "toast_capture_failed": "Сбой захвата экрана",
    "toast_no_clipboard_images": "В буфере обмена нет изображений",
    "toast_use_ctrl_v": "Используйте Ctrl+V для вставки картинки напрямую",
    "toast_imported_qr": "Импортировано из QR!",
    "toast_imported_count": "Импортировано аккаунтов: $1",
    "toast_save_error_multi": "Ошибка сохранения аккаунт(ов)",
    "toast_import_cancelled": "Импорт отменен",
    "toast_gen_error": "Ошибка генерации кода",
    "toast_code_copied": "Код скопирован!",
    "toast_copy_error": "Ошибка копирования",
    "toast_code_updated": "Код обновлен!",
    "toast_update_error": "Ошибка обновления кода",
    "toast_account_deleted": "Аккаунт удален",
    "toast_accent_updated": "Акцентный цвет изменен",
    "toast_privacy_enabled": "Режим приватности включен",
    "toast_privacy_disabled": "Режим приватности выключен",
    "toast_clipboard_timer_updated": "Время автоочистки буфера обновлено",
    "toast_backup_downloaded": "Резервная копия скачана",
    "toast_backup_export_error": "Ошибка экспорта бэкапа",
    "toast_backup_invalid": "Некорректный файл бэкапа",
    "toast_imported_backup_count": "Импортировано: $1 аккаунтов",
    "toast_backup_all_added": "Все аккаунты из бэкапа уже добавлены",
    "toast_file_read_error": "Ошибка чтения файла",
    "toast_file_import_error": "Ошибка импорта файла",
    "toast_order_updated": "Порядок аккаунтов изменен",
    "toast_order_saved": "Порядок аккаунтов сохранен",
    "toast_reorder_mode": "Режим перемещения. Используйте стрелки ↑/↓.",
    "toast_clipboard_cleared": "Буфер обмена очищен",
    "settings_pin_lock": "Блокировка PIN-кодом",
    "lock_title": "Приложение заблокировано",
    "pin_setup_title": "Установите новый PIN",
    "pin_confirm_title": "Подтвердите новый PIN",
    "pin_enter_current": "Введите текущий PIN",
    "toast_pin_mismatch": "PIN-коды не совпадают!",
    "toast_pin_set": "PIN-код установлен",
    "toast_pin_disabled": "Блокировка PIN-кодом отключена",
    "toast_pin_incorrect": "Неверный PIN-код",
    "category_all": "Все",
    "category_personal": "Личные",
    "category_work": "Работа",
    "category_finance": "Финансы",
    "category_social": "Соцсети",
    "category_other": "Другое",
    "category_none": "Без категории",
    "category_create_new": "+ Создать категорию...",
    "settings_categories": "Мои категории",
    "placeholder_new_category": "Название категории...",
    "toast_category_added": "Категория добавлена",
    "toast_category_deleted": "Категория удалена",
    "toast_category_exists": "Такая категория уже есть",
    "toast_category_empty": "Введите название категории",
    "settings_theme_mode": "Тема приложения",
    "theme_dark": "Темная",
    "theme_light": "Светлая",
    "crop_toast_no_screenshot": "Скриншот не найден. Пожалуйста, откройте расширение и попробуйте снова.",
    "crop_toast_no_qr": "QR-код не найден в выделенной области. Попробуйте ещё раз.",
    "crop_toast_invalid_qr": "Некорректные данные QR-кода",
    "crop_toast_invalid_key": "Секретный ключ для $1 некорректен",
    "crop_toast_imported_success": "Аккаунт успешно импортирован!",
    "crop_toast_imported_count": "Импортировано аккаунтов: $1",
    "crop_toast_import_error": "Ошибка импорта аккаунта",
    "settings_language": "Язык приложения",
    "lang_auto": "По умолчанию",
    "lang_en": "English",
    "lang_ru": "Русский"
  }
};

let currentLang = "auto";

export function setLanguage(lang) {
  currentLang = lang;
}

export function initTranslations() {
  // 1. Translate elements with data-i18n
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
      el.textContent = msg;
    }
  });

  // 2. Translate tooltips
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    const msg = getTranslation(key);
    if (msg) {
      el.setAttribute("title", msg);
    }
  });
}

export function getTranslation(key, substitutions = null) {
  let lang = currentLang;
  if (lang === "auto") {
    // Detect browser language
    const uiLang = chrome.i18n.getUILanguage ? chrome.i18n.getUILanguage() : "";
    lang = uiLang.startsWith("ru") ? "ru" : "en";
  }

  let msg = "";
  if (LANG_MAPS[lang] && LANG_MAPS[lang][key]) {
    msg = LANG_MAPS[lang][key];
  } else {
    // Fallback to English
    msg = LANG_MAPS.en[key] || "";
  }

  if (msg && substitutions && substitutions.length > 0) {
    if (!Array.isArray(substitutions)) {
      substitutions = [substitutions.toString()];
    }
    substitutions.forEach((sub, idx) => {
      msg = msg.replace(`$${idx + 1}`, sub);
    });
  }

  return msg;
}
