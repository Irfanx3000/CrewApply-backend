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
      // These are fixed windows, so the real wait is however much of the
      // current window is left — NOT the full windowMs. Trip the limit 14
      // minutes into a 15-minute window and the honest answer is "about a
      // minute". The messages used to hardcode the window length ("try again
      // in 15 minutes"), which was wrong in every case except the first
      // request of a window, and trained users to wait far longer than needed.
      const resetTime = req.rateLimit?.resetTime;
      const retryAfterSeconds = resetTime
        ? Math.max(1, Math.ceil((new Date(resetTime).getTime() - Date.now()) / 1000))
        : Math.ceil(windowMs / 1000);

      // Standard HTTP semantics, independent of the JSON body — respected by
      // proxies and HTTP clients that know nothing about our response shape.
      res.set('Retry-After', String(retryAfterSeconds));

      return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
        success: false,
        message: message || AUTH_MESSAGES.TOO_MANY_REQUESTS,
        code: 'RATE_LIMIT_EXCEEDED',
        details: {
          retryAfterSeconds,
          retryAt: resetTime ? new Date(resetTime).toISOString() : null,
        },
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
  // No duration in the copy — it was wrong whenever the limit tripped
  // mid-window. Clients render the real wait from details.retryAfterSeconds;
  // this string is only the fallback for clients that don't.
  message: 'Too many authentication attempts. Please wait before trying again.',
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
