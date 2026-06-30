'use strict';

const rateLimit = require('express-rate-limit');
const { config } = require('../config');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

/**
 * Factory that creates an express-rate-limit middleware with a standardised
 * error response format consistent with the rest of the API.
 *
 * @param {{ windowMs: number, max: number, message?: string }} options
 * @returns {import('express').RequestHandler}
 */
const createLimiter = ({ windowMs, max, message }) => {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
        success: false,
        message: message || AUTH_MESSAGES.TOO_MANY_REQUESTS,
        code: 'RATE_LIMIT_EXCEEDED',
      });
    },
  });
};

/**
 * Applied to all authentication endpoints (register, login).
 * 10 attempts per 15 minutes per IP.
 */
const authLimiter = createLimiter({
  windowMs: config.rateLimit.auth.windowMs,
  max: config.rateLimit.auth.max,
  message: 'Too many authentication attempts. Please try again in 15 minutes.',
});

/**
 * Applied to the forgot-password and resend-verification endpoints.
 * 5 requests per hour per IP — stricter to prevent email flooding.
 */
const passwordResetLimiter = createLimiter({
  windowMs: config.rateLimit.passwordReset.windowMs,
  max: config.rateLimit.passwordReset.max,
  message: 'Too many password reset requests. Please wait before trying again.',
});

/**
 * General-purpose limiter for all API routes.
 * 100 requests per 15 minutes per IP.
 */
const generalLimiter = createLimiter({
  windowMs: config.rateLimit.general.windowMs,
  max: config.rateLimit.general.max,
});

module.exports = { authLimiter, passwordResetLimiter, generalLimiter };
