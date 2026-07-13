'use strict';

const TOKEN_TYPES = Object.freeze({
  ACCESS: 'access',
  REFRESH: 'refresh',
  EMAIL_VERIFICATION: 'email_verification',
  PASSWORD_RESET: 'password_reset',
  DOCUMENT_VIEW: 'document_view',
});

const COOKIE_NAMES = Object.freeze({
  REFRESH_TOKEN: 'refreshToken',
});

const BEARER_PREFIX = 'Bearer ';

module.exports = { TOKEN_TYPES, COOKIE_NAMES, BEARER_PREFIX };
