'use strict';

/**
 * Operational error class for all known, expected errors in the application.
 *
 * Distinguishes expected errors (e.g. invalid input, not found) from
 * unexpected programmer errors (bugs, third-party failures).
 *
 * The error middleware checks `isOperational` to decide whether to expose
 * the message to the client or return a generic 500 response.
 */
class AppError extends Error {
  /**
   * @param {string} message   - Human-readable message sent to the client.
   * @param {number} statusCode - HTTP status code (400, 401, 403, 404, 409 …).
   * @param {string} [code]    - Machine-readable error code for clients (e.g. 'EMAIL_NOT_VERIFIED').
   * @param {Array}  [details] - Validation error details: [{ field, message }].
   */
  constructor(message, statusCode = 500, code = null, details = null) {
    super(message);

    this.name = 'AppError';
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.code = code;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
