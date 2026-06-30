'use strict';

const { REGEX } = require('../constants/regex');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

/**
 * Validates password strength against the policy defined in REGEX.PASSWORD_STRENGTH.
 *
 * At minimum requires: 8+ characters, one uppercase, one lowercase,
 * one digit, and one special character.
 *
 * @param {string} password
 * @throws {AppError} When the password does not meet the policy.
 */
const validateStrength = (password) => {
  if (!REGEX.PASSWORD_STRENGTH.test(password)) {
    throw new AppError(
      'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.',
      HTTP_STATUS.BAD_REQUEST,
      'WEAK_PASSWORD'
    );
  }
};

/**
 * Ensures the new password differs from the current one.
 * Designed for change-password flows where the same password is rejected.
 *
 * @param {string} newPassword       - Plaintext new password.
 * @param {string} currentPasswordHash - Stored bcrypt hash of the current password.
 * @throws {AppError} When the passwords match.
 */
const assertPasswordChanged = async (newPassword, currentPasswordHash) => {
  const bcrypt = require('bcryptjs');
  const isSame = await bcrypt.compare(newPassword, currentPasswordHash);

  if (isSame) {
    throw new AppError(
      AUTH_MESSAGES.PASSWORD_SAME_AS_CURRENT,
      HTTP_STATUS.BAD_REQUEST,
      'PASSWORD_UNCHANGED'
    );
  }
};

module.exports = { validateStrength, assertPasswordChanged };
