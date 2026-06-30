'use strict';

const REGEX = Object.freeze({
  // At least 8 chars, one uppercase, one lowercase, one digit, one special character
  PASSWORD_STRENGTH: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#()_\-+={}[\]|:;<>,./~`])[A-Za-z\d@$!%*?&^#()_\-+={}[\]|:;<>,./~`]{8,}$/,

  // Standard name: letters, spaces, hyphens, apostrophes
  NAME: /^[a-zA-Z\s'\-]{2,50}$/,

  // MongoDB ObjectId
  OBJECT_ID: /^[a-f\d]{24}$/i,

  // Hex string (token)
  HEX_TOKEN: /^[a-f0-9]+$/i,

  // E.164 international phone format: +[country code][number], 7–15 digits total
  PHONE_E164: /^\+[1-9]\d{6,14}$/,

  // 6-digit numeric OTP
  OTP_CODE: /^\d{6}$/,
});

module.exports = { REGEX };
