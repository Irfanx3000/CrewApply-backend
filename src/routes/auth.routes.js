'use strict';

const express = require('express');
const router = express.Router();

const authController = require('../controllers/auth.controller');
const authValidation = require('../validations/auth.validation');
const validate = require('../middleware/validate.middleware');
const authenticate = require('../middleware/auth.middleware');
const { authLimiter, otpLimiter, passwordResetLimiter, generalLimiter } = require('../middleware/rateLimiter.middleware');

/**
 * Auth routes — all prefixed with /api/v1/auth via the route index.
 *
 * Convention:
 *   [rateLimiter?] → validate(schema) → [authenticate?] → controller
 */

// ── Registration & mobile OTP (onboarding — dedicated limiter) ────────────────
router.post('/register',            otpLimiter,           validate(authValidation.register),            authController.register);
router.post('/send-otp',            otpLimiter,           validate(authValidation.sendOtp),             authController.sendOtp);
router.post('/verify-mobile',       otpLimiter,           validate(authValidation.verifyMobile),        authController.verifyMobile);

// ── Email verification (secondary) ───────────────────────────────────────────
router.get('/verify-email/:token',                        validate(authValidation.verifyEmail),         authController.verifyEmail);
router.post('/resend-verification', passwordResetLimiter, validate(authValidation.resendVerification),  authController.resendVerification);

// ── Login & token management ──────────────────────────────────────────────────
router.post('/login',               authLimiter,          validate(authValidation.login),               authController.login);
router.post('/refresh',             generalLimiter,       validate(authValidation.refresh),             authController.refresh);

// ── Logout (requires a valid access token to prevent anonymous logout spam) ──
router.post('/logout',              authenticate,         validate(authValidation.logout),              authController.logout);
router.post('/logout-all',          authenticate,                                                       authController.logoutAll);

// ── Password flows ─────────────────────────────────────────────────────────────
router.post('/forgot-password',     passwordResetLimiter, validate(authValidation.forgotPassword),     authController.forgotPassword);
router.post('/reset-password/:token',                     validate(authValidation.resetPassword),      authController.resetPassword);
router.post('/change-password',     authenticate,         validate(authValidation.changePassword),     authController.changePassword);

// ── Google OAuth ───────────────────────────────────────────────────────────────
router.post('/google',              authLimiter,          validate(authValidation.googleAuth),          authController.googleAuth);

// ── Admin invite acceptance (public — invited admin has no session yet) ──────
// The invite itself is admin-only (POST /admin/admin-accounts/invite).
router.post('/accept-admin-invite', otpLimiter,           validate(authValidation.acceptAdminInvite),   authController.acceptAdminInvite);

module.exports = router;