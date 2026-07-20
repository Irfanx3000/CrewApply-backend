'use strict';

const authService = require('../services/auth.service');
const notificationService = require('../services/notification.service');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/apiResponse');
const { AUTH_MESSAGES } = require('../constants/messages');
const { HTTP_STATUS } = require('../constants/httpStatus');

/**
 * Controllers are intentionally thin.
 * Each handler: extracts request data → delegates to service → returns response.
 * No business logic, no model access, no token logic lives here.
 */

// ── POST /auth/register ───────────────────────────────────────────────────────

const register = asyncHandler(async (req, res) => {
  const { name, dateOfBirth, gender, nationality, country, state, city, phone, email, password, referralCode } = req.body;

  const result = await authService.register(
    { name, dateOfBirth, gender, nationality, country, state, city, phone, email, password, referralCode },
    req
  );

  return successResponse(res, AUTH_MESSAGES.REGISTER_PENDING, result, HTTP_STATUS.CREATED);
});

// ── POST /auth/send-otp ───────────────────────────────────────────────────────

const sendOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const result = await authService.sendOtp(email, req);

  return successResponse(res, AUTH_MESSAGES.OTP_RESENT, result);
});

// ── POST /auth/verify-mobile ──────────────────────────────────────────────────

const verifyMobile = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  const result = await authService.verifyMobile({ email, otp }, req);

  await notificationService.notifyAdmins({
    type: notificationService.NOTIFICATION_TYPES.USER_REGISTERED,
    title: 'New User Registered',
    body: `${result.user.name} has joined CrewApply.`,
    data: { userId: result.user.id },
  });

  return successResponse(res, AUTH_MESSAGES.MOBILE_VERIFIED, result, HTTP_STATUS.OK);
});

// ── GET /auth/verify-email/:token ─────────────────────────────────────────────

const verifyEmail = asyncHandler(async (req, res) => {
  await authService.verifyEmail(req.params.token, req);

  return successResponse(res, AUTH_MESSAGES.EMAIL_VERIFIED);
});

// ── POST /auth/resend-verification ───────────────────────────────────────────

const resendVerification = asyncHandler(async (req, res) => {
  await authService.resendVerificationEmail(req.body.email, req);

  return successResponse(res, AUTH_MESSAGES.VERIFICATION_EMAIL_SENT);
});

// ── POST /auth/login ──────────────────────────────────────────────────────────

const login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;

  const result = await authService.login({ identifier, password }, req);

  return successResponse(res, AUTH_MESSAGES.LOGIN_SUCCESS, result);
});

// ── POST /auth/refresh ────────────────────────────────────────────────────────

const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  const tokens = await authService.refreshTokens(refreshToken, req);

  return successResponse(res, AUTH_MESSAGES.TOKEN_REFRESHED, tokens);
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────

const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  await authService.logout(refreshToken, req.user._id, req);

  return successResponse(res, AUTH_MESSAGES.LOGOUT_SUCCESS);
});

// ── POST /auth/logout-all ─────────────────────────────────────────────────────

const logoutAll = asyncHandler(async (req, res) => {
  await authService.logoutAll(req.user._id, req);

  return successResponse(res, AUTH_MESSAGES.LOGOUT_ALL_SUCCESS);
});

// ── POST /auth/forgot-password ────────────────────────────────────────────────

const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body.email, req);

  return successResponse(res, AUTH_MESSAGES.PASSWORD_RESET_EMAIL_SENT);
});

// ── POST /auth/reset-password/:token ─────────────────────────────────────────

const resetPassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body;
  const { token } = req.params;

  await authService.resetPassword({ token, newPassword }, req);

  return successResponse(res, AUTH_MESSAGES.PASSWORD_RESET_SUCCESS);
});

// ── POST /auth/change-password ────────────────────────────────────────────────

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  await authService.changePassword(
    { userId: req.user._id, currentPassword, newPassword },
    req
  );

  return successResponse(res, AUTH_MESSAGES.PASSWORD_CHANGED);
});

// ── POST /auth/google ─────────────────────────────────────────────────────────

const googleAuth = asyncHandler(async (req, res) => {
  const { idToken } = req.body;

  const result = await authService.googleAuth(idToken, req);

  const statusCode = result.isNewUser ? HTTP_STATUS.CREATED : HTTP_STATUS.OK;
  return successResponse(res, AUTH_MESSAGES.GOOGLE_AUTH_SUCCESS, result, statusCode);
});

module.exports = {
  register,
  sendOtp,
  verifyMobile,
  verifyEmail,
  resendVerification,
  login,
  refresh,
  logout,
  logoutAll,
  forgotPassword,
  resetPassword,
  changePassword,
  googleAuth,
};