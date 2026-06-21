/**
 * qr.js – QR code parsing and decoding using jsQR library.
 *
 * Implements:
 *  1. File to Canvas image decoding
 *  2. jsQR execution over ImageData
 *  3. otpauth://totp/ protocol parsing (including custom periods, digits, algorithms)
 *  4. otpauth-migration://offline parser using pure JavaScript Protobuf decoder
 */

/**
 * Encodes a Uint8Array of bytes into an RFC 4648 Base32 string.
 */
function bytesToBase32(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (let i = 0; i < bytes.length; i++) {
    bits += bytes[i].toString(2).padStart(8, "0");
  }
  let base32 = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.substring(i, i + 5);
    if (chunk.length < 5) {
      base32 += alphabet[parseInt(chunk.padEnd(5, "0"), 2)];
    } else {
      base32 += alphabet[parseInt(chunk, 2)];
    }
  }
  while (base32.length % 8 !== 0) {
    base32 += "=";
  }
  return base32;
}

/**
 * Decodes standard or URL-safe Base64 string into a Uint8Array.
 */
function decodeBase64ToBytes(base64Str) {
  let normalized = base64Str.replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4) {
    normalized += "=";
  }
  const binaryString = atob(normalized);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Lightweight Protobuf Varint decoder.
 * Supports arbitrary size varints without buffer pointer corruption.
 */
function readVarint(buffer, offset) {
  let value = 0;
  let shift = 0;
  while (offset < buffer.length) {
    const byte = buffer[offset++];
    // Accumulate using Math.pow to prevent 32-bit signed overflow in JS bitwise operations
    value += (byte & 0x7f) * Math.pow(2, shift);
    if ((byte & 0x80) === 0) {
      return { value, offset };
    }
    shift += 7;
  }
  return { value, offset };
}

/**
 * Decodes MigrationPayload from Protobuf buffer.
 */
function parseProtobuf(buffer) {
  let offset = 0;
  const otpParameters = [];

  while (offset < buffer.length) {
    const { value: tagAndType, offset: nextOffset } = readVarint(buffer, offset);
    offset = nextOffset;
    const tag = tagAndType >> 3;
    const wireType = tagAndType & 0x07;

    if (wireType === 0) { // Varint
      const { offset: varintOffset } = readVarint(buffer, offset);
      offset = varintOffset;
    } else if (wireType === 2) { // Length-delimited
      const { value: length, offset: lenOffset } = readVarint(buffer, offset);
      offset = lenOffset;
      const data = buffer.slice(offset, offset + length);
      offset += length;

      if (tag === 1) { // otp_parameters
        otpParameters.push(parseOtpParameters(data));
      }
    } else {
      // Skip unknown tags safely
      if (wireType === 5) offset += 4;
      else if (wireType === 1) offset += 8;
      else throw new Error("Неподдерживаемый тип Protobuf данных в QR");
    }
  }
  return otpParameters;
}

/**
 * Decodes OtpParameters message from Protobuf buffer.
 */
function parseOtpParameters(buffer) {
  let offset = 0;
  const result = {
    secret: null,
    name: "",
    issuer: "",
    algorithm: 1, // ALGORITHM_SHA1
    digits: 1,    // DIGIT_COUNT_SIX
    type: 2       // OTP_TYPE_TOTP
  };

  while (offset < buffer.length) {
    const { value: tagAndType, offset: nextOffset } = readVarint(buffer, offset);
    offset = nextOffset;
    const tag = tagAndType >> 3;
    const wireType = tagAndType & 0x07;

    if (wireType === 0) { // Varint
      const { value, offset: varintOffset } = readVarint(buffer, offset);
      offset = varintOffset;
      if (tag === 4) result.algorithm = value;
      else if (tag === 5) result.digits = value;
      else if (tag === 6) result.type = value;
    } else if (wireType === 2) { // Length-delimited
      const { value: length, offset: lenOffset } = readVarint(buffer, offset);
      offset = lenOffset;
      const data = buffer.slice(offset, offset + length);
      offset += length;

      if (tag === 1) {
        result.secret = data;
      } else if (tag === 2) {
        result.name = new TextDecoder().decode(data);
      } else if (tag === 3) {
        result.issuer = new TextDecoder().decode(data);
      }
    } else {
      // Skip unknown tags safely
      if (wireType === 5) offset += 4;
      else if (wireType === 1) offset += 8;
      else throw new Error("Неподдерживаемый тип Protobuf данных");
    }
  }
  return result;
}

/**
 * Parse otpauth-migration:// URL parameters.
 */
function parseMigrationUrl(urlStr) {
  const url = new URL(urlStr);
  const dataParam = url.searchParams.get("data");
  if (!dataParam) {
    throw new Error("Отсутствует параметр 'data' в миграционном QR-коде");
  }

  const rawBytes = decodeBase64ToBytes(dataParam);
  const otps = parseProtobuf(rawBytes);

  if (otps.length === 0) {
    throw new Error("Не удалось найти аккаунты в миграционном QR-коде");
  }

  return otps.map(otp => {
    // algorithm enum: 1=SHA1, 2=SHA256, 3=SHA512, 4=MD5
    let algorithm = "SHA-1";
    if (otp.algorithm === 2) algorithm = "SHA-256";
    else if (otp.algorithm === 3) algorithm = "SHA-512";
    else if (otp.algorithm === 4) algorithm = "MD5";

    // digits enum: 1=6, 2=8
    let digits = 6;
    if (otp.digits === 2) digits = 8;

    const secretBase32 = bytesToBase32(otp.secret);

    let service = otp.issuer || "";
    let login = otp.name || "";

    // If login name contains a colon, split it to isolate service/issuer and email
    if (login.includes(":")) {
      const parts = login.split(":");
      const labelIssuer = parts[0].trim();
      const labelLogin = parts[1].trim();
      if (!service) {
        service = labelIssuer;
      }
      login = labelLogin;
    }

    // If service name is still empty, treat name as service name
    if (!service && login) {
      service = login;
      login = "user";
    }

    if (!service) service = "Service";
    if (!login) login = "user";

    return {
      service: service,
      login: login,
      secret: secretBase32,
      period: 30, // Google migration payload assumes 30s period
      digits: digits,
      algorithm: algorithm
    };
  });
}

/**
 * Validates and parses standard otpauth://totp/ URI.
 *
 * @param {string} urlStr
 * @returns {Object} parsed account data
 */
function parseOtpauthUrl(urlStr) {
  if (urlStr.startsWith("otpauth-migration://")) {
    return parseMigrationUrl(urlStr);
  }

  if (!urlStr.startsWith("otpauth://totp/")) {
    throw new Error("Неверный формат: QR-код должен начинаться с 'otpauth://totp/' или 'otpauth-migration://'");
  }

  const url = new URL(urlStr);
  let label = decodeURIComponent(url.pathname.substring(1)); // strip leading "/"
  
  const params = url.searchParams;
  const secret = params.get("secret");
  if (!secret) {
    throw new Error("Секретный ключ (secret) отсутствует в QR-коде");
  }

  let issuer = params.get("issuer") || "";
  let login = "";

  const colonIndex = label.indexOf(":");
  if (colonIndex !== -1) {
    const labelIssuer = label.substring(0, colonIndex).trim();
    const labelLogin = label.substring(colonIndex + 1).trim();
    if (!issuer) {
      issuer = labelIssuer;
    }
    login = labelLogin;
  } else {
    login = label.trim();
  }

  if (!issuer) {
    issuer = "Service";
  }

  const period = parseInt(params.get("period"), 10) || 30;
  const digits = parseInt(params.get("digits"), 10) || 6;
  const algorithm = (params.get("algorithm") || "SHA1").toUpperCase();

  // Return inside an array to normalize the outputs
  return [{
    service: issuer,
    login: login || "user",
    secret: secret,
    period: period,
    digits: digits,
    algorithm: algorithm
  }];
}

/**
 * Decode a QR code from a file input (PNG/JPG/WebP).
 * Always returns a list of parsed accounts (either 1 for standard totp or multiple for migration).
 *
 * @param {File} file
 * @returns {Promise<Array>} Decoded accounts list
 */
function decodeQrCode(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("Файл не выбран"));
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);

          if (!code) {
            reject(new Error("QR-код не обнаружен на изображении. Пожалуйста, убедитесь, что код хорошо виден."));
            return;
          }

          const parsedList = parseOtpauthUrl(code.data);
          resolve(parsedList);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = function () {
        reject(new Error("Не удалось загрузить изображение. Файл может быть поврежден."));
      };
      img.src = e.target.result;
    };
    reader.onerror = function () {
      reject(new Error("Ошибка чтения файла с диска"));
    };
    reader.readAsDataURL(file);
  });
}
