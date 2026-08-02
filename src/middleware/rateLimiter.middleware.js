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
 * Applied to onboarding endpoints (register, send-otp, verify-mobile).
 * More lenient than authLimiter so OTP retries / resends / re-registration
 * don't starve login; OTP endpoints are additionally protected per-phone.
 */
const otpLimiter = createLimiter({
  windowMs: config.rateLimit.otp.windowMs,
  max: config.rateLimit.otp.max,
  message: 'Too many attempts. Please wait a few minutes and try again.',
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
 * Applied to payment order creation (checkout initiation).
 * The webhook is intentionally NOT limited here (payment gateways retry).
 */
const paymentLimiter = createLimiter({
  windowMs: config.rateLimit.payment.windowMs,
  max: config.rateLimit.payment.max,
  message: 'Too many payment attempts. Please wait a few minutes and try again.',
});

/**
 * General-purpose limiter for all API routes.
 * 600 requests per 15 minutes per IP (see config/index.js for rationale).
 */
const generalLimiter = createLimiter({
  windowMs: config.rateLimit.general.windowMs,
  max: config.rateLimit.general.max,
});

/**
 * Applied to the universal search endpoints (admin + app).
 * Each request fans out into several parallel Mongo queries, so this gets
 * its own tighter, shorter-window cap on top of generalLimiter.
 */
const searchLimiter = createLimiter({
  windowMs: config.rateLimit.search.windowMs,
  max: config.rateLimit.search.max,
  message: 'Too many search requests. Please slow down.',
});

/**
 * Applied to the unauthenticated support endpoint (POST /support/public).
 * No session to key throttling off of, so this is tighter than the
 * authenticated support path — 5 submissions per 15 minutes per IP.
 */
const supportPublicLimiter = createLimiter({
  windowMs: config.rateLimit.supportPublic.windowMs,
  max: config.rateLimit.supportPublic.max,
  message: 'Too many support requests. Please wait before trying again.',
});

module.exports = {
  authLimiter,
  otpLimiter,
  passwordResetLimiter,
  paymentLimiter,
  generalLimiter,
  searchLimiter,
  supportPublicLimiter,
};
