'use strict';

const { body, param } = require('express-validator');
const { REGEX } = require('../constants/regex');

// ── Reusable field validators ─────────────────────────────────────────────────

const nameField = () =>
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required.')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters.')
    .matches(REGEX.NAME).withMessage('Name may only contain letters, spaces, hyphens, and apostrophes.');

const emailField = () =>
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Please provide a valid email address.')
    // Only lowercase — do NOT strip Gmail dots/sub-addresses. Login lowercases
    // the identifier but keeps dots, so stripping them here would let a user
    // register but never log in with the address they typed.
    .normalizeEmail({
      gmail_remove_dots: false,
      gmail_remove_subaddress: false,
      outlookdotcom_remove_subaddress: false,
      yahoo_remove_subaddress: false,
      icloud_remove_subaddress: false,
    });

const passwordField = (fieldName = 'password') =>
  body(fieldName)
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.');

const phoneField = (fieldName = 'phone') =>
  body(fieldName)
    .trim()
    .notEmpty().withMessage('Phone number is required.')
    .isLength({ min: 7, max: 20 }).withMessage('Please provide a valid phone number.');

const tokenParam = () =>
  param('token')
    .notEmpty().withMessage('Token is required.')
    .isHexadecimal().withMessage('Invalid token format.')
    .isLength({ min: 64, max: 80 }).withMessage('Invalid token length.');

// ── Validation chains per endpoint ───────────────────────────────────────────

/**
 * POST /auth/register
 * Accepts all Steps 1–3 onboarding fields.
 */
const register = [
  nameField(),

  body('dateOfBirth')
    .notEmpty().withMessage('Date of birth is required.')
    .isString().withMessage('Date of birth must be a string in DD-MM-YYYY or YYYY-MM-DD format.'),

  body('gender')
    .notEmpty().withMessage('Gender is required.')
    .isIn(['Male', 'Female', 'Others']).withMessage('Gender must be Male, Female, or Others.'),

  body('nationality')
    .trim()
    .notEmpty().withMessage('Nationality is required.')
    .isLength({ min: 2, max: 60 }).withMessage('Nationality must be between 2 and 60 characters.'),

  body('country')
    .trim()
    .notEmpty().withMessage('Country is required.')
    .isLength({ min: 2, max: 60 }).withMessage('Country must be between 2 and 60 characters.'),

  // State/City are optional — some countries have no sub-divisions in the
  // client dataset. When provided they must be 2–60 characters.
  body('state')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 60 }).withMessage('State must be between 2 and 60 characters.'),

  body('city')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 60 }).withMessage('City must be between 2 and 60 characters.'),

  phoneField(),
  emailField(),
  passwordField(),

  // Deliberately lenient — an invalid/mistyped code should silently fail to
  // match anyone in referralService.resolveReferrer() rather than blocking
  // registration outright with a validation error over a typo.
  body('referralCode')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 20 }).withMessage('Referral code is too long.'),
];

/**
 * GET /auth/verify-email/:token
 */
const verifyEmail = [
  tokenParam(),
];

/**
 * POST /auth/resend-verification
 */
const resendVerification = [
  emailField(),
];

/**
 * POST /auth/send-otp
 * Resend OTP to the account's email (for unverified accounts).
 */
const sendOtp = [
  emailField(),
];

/**
 * POST /auth/verify-mobile
 * Verify the 6-digit email OTP and activate the account.
 */
const verifyMobile = [
  emailField(),
  body('otp')
    .notEmpty().withMessage('OTP is required.')
    .isLength({ min: 6, max: 6 }).withMessage('OTP must be exactly 6 digits.')
    .isNumeric().withMessage('OTP must contain only digits.'),
];

/**
 * POST /auth/login
 * Accepts email OR phone number as the identifier.
 */
const login = [
  body('identifier')
    .trim()
    .notEmpty().withMessage('Email or phone number is required.'),
  body('password').notEmpty().withMessage('Password is required.'),
];

/**
 * POST /auth/refresh
 */
const refresh = [
  body('refreshToken').notEmpty().withMessage('Refresh token is required.'),
];

/**
 * POST /auth/logout
 */
const logout = [
  body('refreshToken').notEmpty().withMessage('Refresh token is required.'),
];

/**
 * POST /auth/forgot-password
 */
const forgotPassword = [
  emailField(),
];

/**
 * POST /auth/reset-password
 */
const resetPasswordWithOtp = [
  emailField(),
  body('otp')
    .notEmpty().withMessage('OTP is required.')
    .isLength({ min: 6, max: 6 }).withMessage('OTP must be exactly 6 digits.')
    .isNumeric().withMessage('OTP must contain only digits.'),
  passwordField('newPassword'),
  body('confirmPassword')
    .notEmpty().withMessage('Please confirm your new password.')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Passwords do not match.');
      }
      return true;
    }),
];

/**
 * POST /auth/change-password  (authenticated)
 */
const changePassword = [
  body('currentPassword').notEmpty().withMessage('Current password is required.'),
  passwordField('newPassword'),
  body('confirmPassword')
    .notEmpty().withMessage('Please confirm your new password.')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Passwords do not match.');
      }
      return true;
    }),
];

/**
 * POST /auth/google
 */
const googleAuth = [
  body('idToken').notEmpty().withMessage('Google ID token is required.'),
];

/**
 * POST /auth/accept-admin-invite
 * Verifies the 6-digit email OTP an existing admin's invite sent, then sets
 * the invited admin's name + password and activates the account.
 */
const acceptAdminInvite = [
  emailField(),
  body('otp')
    .notEmpty().withMessage('OTP is required.')
    .isLength({ min: 6, max: 6 }).withMessage('OTP must be exactly 6 digits.')
    .isNumeric().withMessage('OTP must contain only digits.'),
  nameField(),
  passwordField(),
  body('confirmPassword')
    .notEmpty().withMessage('Please confirm your password.')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match.');
      }
      return true;
    }),
];

module.exports = {
  register,
  verifyEmail,
  resendVerification,
  sendOtp,
  verifyMobile,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPasswordWithOtp,
  changePassword,
  googleAuth,
  acceptAdminInvite,
  // Exported for reuse by adminAccount.validation.js (inviting an admin needs
  // the same email format rules, without the rest of the register() chain).
  emailField,
};