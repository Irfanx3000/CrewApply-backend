'use strict';

const mongoose = require('mongoose');
const { errorResponse } = require('../utils/apiResponse');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { config } = require('../config');

/**
 * Normalises a Mongoose ValidationError into an AppError with field-level details.
 */
const handleMongooseValidationError = (err) => {
  const details = Object.values(err.errors).map((e) => ({
    field: e.path,
    message: e.message,
  }));
  return new AppError('Validation failed.', HTTP_STATUS.BAD_REQUEST, 'VALIDATION_ERROR', details);
};

/**
 * Normalises a Mongoose CastError (e.g. invalid ObjectId) into a 400 AppError.
 */
const handleMongooseCastError = (err) => {
  return new AppError(
    `Invalid value for field '${err.path}'.`,
    HTTP_STATUS.BAD_REQUEST,
    'INVALID_FIELD'
  );
};

/**
 * Normalises a MongoDB duplicate key error (code 11000) into a 409 AppError.
 */
const handleMongoDuplicateKey = (err) => {
  const field = Object.keys(err.keyValue || {})[0] || 'field';
  return new AppError(
    `A record with this ${field} already exists.`,
    HTTP_STATUS.CONFLICT,
    'DUPLICATE_KEY'
  );
};

/**
 * Normalises a JWT error into a 401 AppError.
 */
const handleJwtError = () => {
  return new AppError('Invalid or expired authentication token.', HTTP_STATUS.UNAUTHORIZED, 'INVALID_TOKEN');
};

/**
 * Centralised error-handling middleware.
 *
 * All errors flow here via next(err).
 * Operational errors (AppError.isOperational) are sent to the client with
 * their message and code. Non-operational errors are logged and masked as
 * a generic 500 in production to avoid leaking internals.
 */
const errorMiddleware = (err, _req, res, _next) => {
  let error = err;

  // ── Normalise known error types ──────────────────────────────────────────
  if (error instanceof mongoose.Error.ValidationError) {
    error = handleMongooseValidationError(error);
  } else if (error instanceof mongoose.Error.CastError) {
    error = handleMongooseCastError(error);
  } else if (error.code === 11000) {
    error = handleMongoDuplicateKey(error);
  } else if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    error = handleJwtError();
  }

  // ── Determine whether to expose details ─────────────────────────────────
  if (error.isOperational) {
    // Any error that knows when the caller may retry (today: the 423 account
    // lockout) advertises it as a standard header too, not just inside our
    // own JSON envelope.
    if (error.details?.retryAfterSeconds) {
      res.set('Retry-After', String(error.details.retryAfterSeconds));
    }
    return errorResponse(res, error.message, error.statusCode, error.code, error.details);
  }

  // Non-operational error — log in full, expose nothing sensitive.
  console.error('💥 UNHANDLED ERROR:', error);

  const message = config.isProduction ? 'An unexpected error occurred.' : error.message;

  return errorResponse(res, message, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR');
};

module.exports = errorMiddleware;
