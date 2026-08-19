'use strict';

const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

// ── KNOWN LIMITATION: the store is in-memory, per process ─────────────────────
//
// express-rate-limit's default MemoryStore keeps counters in the Node heap, so
// they are (a) lost on every restart or deploy and (b) NOT shared between
// processes. Two consequences, both currently acceptable and both deliberate:
//
//   * The API runs as a single PM2 process (ecosystem.config.js, exec_mode
//     'fork', instances: 1) precisely so this store stays correct. Switching to
//     cluster mode WITHOUT first moving to a shared store would silently
//     multiply every limit by the worker count -- the login limiter would
//     become 10*N per 15 minutes, which is a real weakening of brute-force
//     protection, not a cosmetic one.
//
//   * That single process is also the current ceiling on vertical scale.
//
// For the 10-20k registered-user target this is a reasonable trade: one process
// comfortably serves that population's realistic concurrency, and avoiding a
// Redis dependency keeps the deployment a single VPS with no new moving parts.
//
// The migration path, when traffic justifies it, is small and well-trodden:
// swap in rate-limit-redis as the `store`, THEN raise PM2 to cluster mode, and
// put a lock around the cron jobs in server.js so they do not run per worker.
// Order matters -- doing it the other way round is the weakening described above.

/**
 * Reads the `sub` claim out of a JWT WITHOUT verifying it. Only ever used to
 * choose a rate-limit bucket -- never for access control. Returns null for
 * anything malformed so the caller falls back to the IP key.
 */
const decodeJwtSubject = (token) => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof json.sub === 'string' && json.sub.length > 0 ? json.sub : null;
  } catch {
    return null;
  }
};
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
const createLimiter = ({ windowMs, max, message, keyGenerator }) => {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    ...(keyGenerator ? { keyGenerator } : {}),
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
  // Keyed per USER when we know who is asking, and only per IP otherwise.
  //
  // Carrier-grade NAT puts large numbers of mobile subscribers behind a single
  // public address -- the norm on the Indian and Gulf networks this app's
  // pricing targets. With a pure per-IP key those users share one 600-request
  // budget between them, so a few dozen simultaneous users on the same carrier
  // start receiving 429s despite doing nothing wrong. It presents as a random,
  // unreproducible bug, which is the worst kind to support.
  //
  // The auth, OTP and password-reset limiters below deliberately stay on IP:
  // an attacker brute-forcing a login has no session, so per-IP is the only
  // meaningful key there, and that is exactly where throttling matters most.
  //
  // Note this runs BEFORE the authenticate middleware, so req.user is not
  // populated yet -- the subject is read from the bearer token's `sub` claim
  // without verifying the signature. That is safe for this purpose: an
  // unverified token can only ever move a request into its own per-user
  // bucket, and a forged one still has to pass real authentication downstream.
  // The worst an attacker can do is rotate fake subjects to escape their own
  // limit, which lands them back at the per-IP behaviour we had before.
  keyGenerator: (req) => {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      const claims = decodeJwtSubject(header.slice(7));
      if (claims) return `u:${claims}`;
    }
    return `ip:${ipKeyGenerator(req.ip)}`;
  },
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
