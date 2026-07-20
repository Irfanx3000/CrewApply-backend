'use strict';

const User = require('../models/user.model');
const { config } = require('../config');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');
const { AUDIT_EVENTS } = require('../constants/audit');
const { OTP_PURPOSES } = require('../constants/otp');
const { generateTokenPair, hashToken } = require('../utils/crypto.util');
const { validateStrength, assertPasswordChanged } = require('./password.service');
const { signAccessToken, createRefreshToken, rotateRefreshToken, validateRefreshToken, revokeRefreshToken, revokeAllRefreshTokens } = require('./token.service');
const { sendVerificationEmail, sendPasswordResetEmail, sendOtpEmail } = require('./email.service');
const { verifyGoogleIdToken } = require('./oAuth.service');
const { createOtp, verifyOtp, clearOtp } = require('./otp.service');
const auditService = require('./audit.service');
const referralService = require('./referral.service');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extracts request context (IP + user-agent) for logging and token storage.
 */
const extractContext = (req) => ({
  ipAddress: req.ip || req.connection?.remoteAddress || null,
  userAgent: req.get('user-agent') || null,
});

/**
 * Normalises a raw phone string to E.164 format.
 * Handles: +91..., 91..., 0..., and bare 10-digit Indian numbers.
 */
const normalizePhone = (raw) => {
  const cleaned = raw.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (/^91\d{10}$/.test(cleaned)) return `+${cleaned}`;
  if (/^\d{10}$/.test(cleaned)) return `+91${cleaned}`;
  if (/^0\d{10}$/.test(cleaned)) return `+91${cleaned.slice(1)}`;
  return cleaned;
};

/**
 * Parses a date string in DD-MM-YYYY or YYYY-MM-DD (ISO) format to a Date.
 */
const parseDateOfBirth = (dateStr) => {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dateStr);
  if (match) {
    const [, dd, mm, yyyy] = match;
    return new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
  }
  // Fallback: ISO or any other format (e.g. from Postman)
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Returns true if the given date is at least 18 years in the past.
 */
const isAtLeast18 = (dob) => {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 18);
  return dob <= cutoff;
};

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * Registers a new user with the full onboarding payload (Steps 1–3).
 * Creates an inactive account and dispatches a mobile OTP.
 * Does NOT return tokens — the account activates after OTP verification.
 */
const register = async (body, req) => {
  const { name, dateOfBirth, gender, nationality, country, state, city, phone, email, password, referralCode } = body;

  validateStrength(password);

  const normalizedPhone = normalizePhone(phone);
  const dob = parseDateOfBirth(dateOfBirth);

  if (!dob) {
    throw new AppError(
      'Invalid date of birth. Use DD-MM-YYYY or YYYY-MM-DD format.',
      HTTP_STATUS.BAD_REQUEST,
      'INVALID_DOB'
    );
  }

  if (!isAtLeast18(dob)) {
    throw new AppError('You must be at least 18 years old to register.', HTTP_STATUS.BAD_REQUEST, 'AGE_REQUIREMENT');
  }

  // Block ONLY if a fully-registered (verified) account already owns this email
  // or phone. This lets a user go back through onboarding, change details, and
  // resubmit without hitting a duplicate error on a half-finished registration.
  const verifiedConflict = await User.findOne({
    emailVerified: true,
    $or: [{ email }, { phone: normalizedPhone }],
  });
  if (verifiedConflict) {
    if (verifiedConflict.email === email) {
      throw new AppError(AUTH_MESSAGES.EMAIL_ALREADY_EXISTS, HTTP_STATUS.CONFLICT, 'EMAIL_EXISTS');
    }
    throw new AppError(AUTH_MESSAGES.PHONE_ALREADY_REGISTERED, HTTP_STATUS.CONFLICT, 'PHONE_EXISTS');
  }

  // Remove any prior UNVERIFIED registration for this email or phone so a repeat
  // submission (edited or not) starts clean and just re-sends a fresh OTP.
  await User.deleteMany({
    emailVerified: false,
    $or: [{ email }, { phone: normalizedPhone }],
  });
  // Clear the prior OTP so this deliberate re-registration isn't blocked by the
  // 60s resend cooldown (the cooldown still applies to the Resend OTP button).
  await clearOtp(email, OTP_PURPOSES.MOBILE_VERIFICATION);

  // Resolve an optional referral code up front — invalid/unknown codes
  // soft-fail (a typo shouldn't block signup) rather than throwing; the
  // caller is told via `referralApplied` so the UI can warn/offer a retry.
  // The actual Referral row is only created once this account is
  // phone-verified (see verifyMobile()), so a resubmit-before-verify never
  // orphans a row.
  //
  // A user's OWN referralCode is deliberately NOT generated here — it's only
  // created on demand (see referral.service.js's generateCode(), wired to
  // POST /user/referral/generate) so the mobile Refer & Earn screen can offer
  // an explicit "Generate Code" action instead of showing one pre-filled.
  const referrer = referralCode ? await referralService.resolveReferrer(referralCode, { email, phone: normalizedPhone }) : null;
  const referralApplied = referralCode ? !!referrer : null;

  const user = await User.create({
    name,
    email,
    password,
    phone: normalizedPhone,
    dateOfBirth: dob,
    gender,
    nationality,
    country,
    state,
    city,
    isActive: false,
    emailVerified: false,
    referredBy: referrer ? referrer._id : null,
  });

  // Generate OTP and send — non-blocking failure does NOT abort registration.
  const rawOtp = await createOtp(email, OTP_PURPOSES.MOBILE_VERIFICATION);
  sendOtpEmail({ to: email, name: user.name, otp: rawOtp }).catch((err) => {
    console.error('AuthService.register: OTP email send failed:', err.message);
  });

  const context = extractContext(req);
  // Fire-and-forget audit logs — they must not add DB round-trips to the response.
  auditService.log({ event: AUDIT_EVENTS.REGISTER, userId: user._id, ...context }).catch(() => {});
  auditService.log({
    event: AUDIT_EVENTS.MOBILE_OTP_SENT,
    userId: user._id,
    ...context,
    metadata: { email },
  }).catch(() => {});

  return { id: user._id, name: user.name, email: user.email, phone: normalizedPhone, referralApplied };
};

// ── Send / Resend OTP ─────────────────────────────────────────────────────────

/**
 * Resends a mobile OTP to an unverified account.
 * Enforces the 60-second resend cooldown (handled by otp.service).
 */
const sendOtp = async (email, req) => {
  const user = await User.findOne({ email });

  if (!user) {
    throw new AppError(AUTH_MESSAGES.NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'USER_NOT_FOUND');
  }

  if (user.emailVerified) {
    throw new AppError('This account is already verified.', HTTP_STATUS.BAD_REQUEST, 'ALREADY_VERIFIED');
  }

  const rawOtp = await createOtp(email, OTP_PURPOSES.MOBILE_VERIFICATION);
  sendOtpEmail({ to: email, name: user.name, otp: rawOtp }).catch((err) => {
    console.error('AuthService.sendOtp: OTP email send failed:', err.message);
  });

  const context = extractContext(req);
  await auditService.log({
    event: AUDIT_EVENTS.MOBILE_OTP_SENT,
    userId: user._id,
    ...context,
    metadata: { email },
  });

  return { email };
};

// ── Verify Mobile OTP ─────────────────────────────────────────────────────────

/**
 * Verifies the 6-digit OTP sent to the user's email.
 * On success: activates the account and issues access + refresh tokens.
 */
const verifyMobile = async ({ email, otp }, req) => {
  const context = extractContext(req);

  const user = await User.findOne({ email });

  if (!user) {
    throw new AppError(AUTH_MESSAGES.NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'USER_NOT_FOUND');
  }

  if (user.emailVerified) {
    throw new AppError('Account is already verified.', HTTP_STATUS.BAD_REQUEST, 'ALREADY_VERIFIED');
  }

  try {
    await verifyOtp(email, otp, OTP_PURPOSES.MOBILE_VERIFICATION);
  } catch (err) {
    await auditService.log({
      event: AUDIT_EVENTS.MOBILE_OTP_FAILED,
      userId: user._id,
      ...context,
      metadata: { email, code: err.code },
    });
    throw err;
  }

  user.emailVerified = true;
  user.isActive = true;
  await user.save({ validateBeforeSave: false });

  const accessToken = signAccessToken(user);
  const refreshToken = await createRefreshToken(user._id, context);

  auditService.log({ event: AUDIT_EVENTS.MOBILE_OTP_VERIFIED, userId: user._id, ...context }).catch(() => {});

  // Referral row is only created now (not at register()) so a resubmit
  // before verification never orphans a row for a deleted-and-recreated user.
  if (user.referredBy) {
    referralService.attribute(user, req).catch((err) => {
      console.error('AuthService.verifyMobile: referral attribution failed (non-fatal):', err.message);
    });
  }

  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      onboardingCompleted: user.onboardingCompleted,
    },
  };
};

// ── Email Verification ────────────────────────────────────────────────────────

const verifyEmail = async (rawToken, req) => {
  const tokenHash = hashToken(rawToken);

  const user = await User.findOne({
    emailVerificationTokenHash: tokenHash,
    emailVerificationTokenExpiry: { $gt: new Date() },
  }).select('+emailVerificationTokenHash +emailVerificationTokenExpiry');

  if (!user) {
    throw new AppError(AUTH_MESSAGES.INVALID_VERIFICATION_TOKEN, HTTP_STATUS.BAD_REQUEST, 'INVALID_TOKEN');
  }

  if (user.emailVerified) {
    throw new AppError(AUTH_MESSAGES.EMAIL_ALREADY_VERIFIED, HTTP_STATUS.BAD_REQUEST, 'ALREADY_VERIFIED');
  }

  user.emailVerified = true;
  user.emailVerificationTokenHash = undefined;
  user.emailVerificationTokenExpiry = undefined;
  await user.save({ validateBeforeSave: false });

  const context = extractContext(req);
  await auditService.log({ event: AUDIT_EVENTS.EMAIL_VERIFIED, userId: user._id, ...context });
};

const resendVerificationEmail = async (email, req) => {
  const user = await User.findOne({ email }).select(
    '+emailVerificationTokenHash +emailVerificationTokenExpiry'
  );

  if (!user || user.emailVerified) return;

  const { rawToken, hashedToken } = generateTokenPair(32);
  const expiryHours = config.security.emailVerificationExpiryHours;

  user.emailVerificationTokenHash = hashedToken;
  user.emailVerificationTokenExpiry = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  sendVerificationEmail({ to: user.email, name: user.name, token: rawToken }).catch((err) => {
    console.error('AuthService.resendVerificationEmail: email send failed:', err.message);
  });

  const context = extractContext(req);
  await auditService.log({ event: AUDIT_EVENTS.VERIFICATION_EMAIL_RESENT, userId: user._id, ...context });
};

// ── Login ─────────────────────────────────────────────────────────────────────

/**
 * Authenticates a user with email OR phone + password.
 * The identifier field is auto-detected: if it contains '@' it is treated as an
 * email, otherwise it is normalised and matched against the phone field.
 */
const login = async ({ identifier, password }, req) => {
  const context = extractContext(req);

  const isPhone = !identifier.includes('@');
  let user;

  if (isPhone) {
    const normalizedPhone = normalizePhone(identifier);
    user = await User.findOne({ phone: normalizedPhone }).select('+password +loginAttempts +lockUntil');
  } else {
    user = await User.findOne({ email: identifier.toLowerCase().trim() }).select(
      '+password +loginAttempts +lockUntil'
    );
  }

  if (!user) {
    throw new AppError(AUTH_MESSAGES.INVALID_CREDENTIALS, HTTP_STATUS.UNAUTHORIZED, 'INVALID_CREDENTIALS');
  }

  if (!user.isActive) {
    throw new AppError(AUTH_MESSAGES.ACCOUNT_INACTIVE, HTTP_STATUS.FORBIDDEN, 'ACCOUNT_INACTIVE');
  }

  if (user.isLocked) {
    throw new AppError(AUTH_MESSAGES.ACCOUNT_LOCKED, HTTP_STATUS.LOCKED, 'ACCOUNT_LOCKED');
  }

  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    await user.handleFailedLogin();

    await auditService.log({
      event: AUDIT_EVENTS.LOGIN_FAILED,
      userId: user._id,
      ...context,
      metadata: { attempts: user.loginAttempts },
    });

    if (user.isLocked) {
      await auditService.log({ event: AUDIT_EVENTS.ACCOUNT_LOCKED, userId: user._id, ...context });
      throw new AppError(AUTH_MESSAGES.ACCOUNT_LOCKED, HTTP_STATUS.LOCKED, 'ACCOUNT_LOCKED');
    }

    throw new AppError(AUTH_MESSAGES.INVALID_CREDENTIALS, HTTP_STATUS.UNAUTHORIZED, 'INVALID_CREDENTIALS');
  }

  await user.resetLoginAttempts();

  const accessToken = signAccessToken(user);
  const refreshToken = await createRefreshToken(user._id, context);

  auditService.log({ event: AUDIT_EVENTS.LOGIN, userId: user._id, ...context }).catch(() => {});

  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      onboardingCompleted: user.onboardingCompleted,
    },
  };
};

// ── Token Refresh ─────────────────────────────────────────────────────────────

const refreshTokens = async (rawRefreshToken, req) => {
  const context = extractContext(req);

  const tokenDoc = await validateRefreshToken(rawRefreshToken);

  const user = await User.findById(tokenDoc.userId);

  if (!user || !user.isActive) {
    throw new AppError(AUTH_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED, 'UNAUTHORIZED');
  }

  const accessToken = signAccessToken(user);
  const newRefreshToken = await rotateRefreshToken(tokenDoc, context);

  await auditService.log({ event: AUDIT_EVENTS.TOKEN_REFRESHED, userId: user._id, ...context });

  return { accessToken, refreshToken: newRefreshToken };
};

// ── Logout ────────────────────────────────────────────────────────────────────

const logout = async (rawRefreshToken, userId, req) => {
  await revokeRefreshToken(rawRefreshToken);
  const context = extractContext(req);
  await auditService.log({ event: AUDIT_EVENTS.LOGOUT, userId, ...context });
};

const logoutAll = async (userId, req) => {
  await revokeAllRefreshTokens(userId);
  const context = extractContext(req);
  await auditService.log({ event: AUDIT_EVENTS.LOGOUT_ALL, userId, ...context });
};

// ── Password ──────────────────────────────────────────────────────────────────

const forgotPassword = async (email, req) => {
  const context = extractContext(req);

  const user = await User.findOne({ email });
  if (!user) return;

  const { rawToken, hashedToken } = generateTokenPair(32);
  const expiryHours = config.security.passwordResetExpiryHours;

  user.passwordResetTokenHash = hashedToken;
  user.passwordResetTokenExpiry = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  sendPasswordResetEmail({ to: user.email, name: user.name, token: rawToken }).catch((err) => {
    console.error('AuthService.forgotPassword: email send failed:', err.message);
  });

  await auditService.log({ event: AUDIT_EVENTS.PASSWORD_RESET_REQUESTED, userId: user._id, ...context });
};

const resetPassword = async ({ token, newPassword }, req) => {
  validateStrength(newPassword);

  const tokenHash = hashToken(token);

  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetTokenExpiry: { $gt: new Date() },
  }).select('+passwordResetTokenHash +passwordResetTokenExpiry +password');

  if (!user) {
    throw new AppError(AUTH_MESSAGES.INVALID_RESET_TOKEN, HTTP_STATUS.BAD_REQUEST, 'INVALID_TOKEN');
  }

  user.password = newPassword;
  user.passwordResetTokenHash = undefined;
  user.passwordResetTokenExpiry = undefined;
  await user.save();

  await revokeAllRefreshTokens(user._id);

  const context = extractContext(req);
  await auditService.log({ event: AUDIT_EVENTS.PASSWORD_RESET, userId: user._id, ...context });
};

const changePassword = async ({ userId, currentPassword, newPassword }, req) => {
  validateStrength(newPassword);

  const user = await User.findById(userId).select('+password');

  if (!user) {
    throw new AppError(AUTH_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED, 'UNAUTHORIZED');
  }

  const isCurrentPasswordValid = await user.comparePassword(currentPassword);

  if (!isCurrentPasswordValid) {
    throw new AppError(AUTH_MESSAGES.INCORRECT_CURRENT_PASSWORD, HTTP_STATUS.BAD_REQUEST, 'WRONG_PASSWORD');
  }

  await assertPasswordChanged(newPassword, user.password);

  user.password = newPassword;
  await user.save();

  await revokeAllRefreshTokens(userId);

  const context = extractContext(req);
  await auditService.log({ event: AUDIT_EVENTS.PASSWORD_CHANGED, userId, ...context });
};

// ── Google OAuth ──────────────────────────────────────────────────────────────

const googleAuth = async (idToken, req) => {
  const context = extractContext(req);

  const googlePayload = await verifyGoogleIdToken(idToken);

  let user = await User.findOne({
    $or: [{ googleId: googlePayload.googleId }, { email: googlePayload.email }],
  });

  let isNewUser = false;

  if (!user) {
    user = await User.create({
      name: googlePayload.name,
      email: googlePayload.email,
      googleId: googlePayload.googleId,
      emailVerified: googlePayload.emailVerified,
      avatar: googlePayload.avatar,
      isActive: true,
    });

    isNewUser = true;
    await auditService.log({ event: AUDIT_EVENTS.GOOGLE_REGISTER, userId: user._id, ...context });
  } else {
    if (!user.googleId) user.googleId = googlePayload.googleId;
    if (!user.emailVerified && googlePayload.emailVerified) user.emailVerified = true;
    if (!user.avatar && googlePayload.avatar) user.avatar = googlePayload.avatar;

    await user.save({ validateBeforeSave: false });
    await auditService.log({ event: AUDIT_EVENTS.GOOGLE_LOGIN, userId: user._id, ...context });
  }

  if (!user.isActive) {
    throw new AppError(AUTH_MESSAGES.ACCOUNT_INACTIVE, HTTP_STATUS.FORBIDDEN, 'ACCOUNT_INACTIVE');
  }

  const accessToken = signAccessToken(user);
  const refreshToken = await createRefreshToken(user._id, context);

  return {
    accessToken,
    refreshToken,
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
    isNewUser,
  };
};

module.exports = {
  register,
  sendOtp,
  verifyMobile,
  verifyEmail,
  resendVerificationEmail,
  login,
  refreshTokens,
  logout,
  logoutAll,
  forgotPassword,
  resetPassword,
  changePassword,
  googleAuth,
};