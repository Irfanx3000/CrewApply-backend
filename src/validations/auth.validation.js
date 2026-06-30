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
    .normalizeEmail();

const passwordField = (fieldName = 'password') =>
  body(fieldName)
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(REGEX.PASSWORD_STRENGTH)
    .withMessage('Password must include uppercase, lowercase, a number, and a special character.');

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

  body('state')
    .trim()
    .notEmpty().withMessage('State/Province is required.')
    .isLength({ min: 2, max: 60 }).withMessage('State must be between 2 and 60 characters.'),

  body('city')
    .trim()
    .notEmpty().withMessage('City is required.')
    .isLength({ min: 2, max: 60 }).withMessage('City must be between 2 and 60 characters.'),

  phoneField(),
  emailField(),
  passwordField(),
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
 * Resend OTP to a phone number (for unverified accounts).
 */
const sendOtp = [
  phoneField(),
];

/**
 * POST /auth/verify-mobile
 * Verify the 6-digit OTP and activate the account.
 */
const verifyMobile = [
  phoneField(),
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
 * POST /auth/reset-password/:token
 */
const resetPassword = [
  tokenParam(),
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
  resetPassword,
  changePassword,
  googleAuth,
};