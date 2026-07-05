'use strict';

const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

/**
 * Validates the password policy: at least 8 characters.
 *
 * @param {string} password
 * @throws {AppError} When the password is shorter than 8 characters.
 */
const validateStrength = (password) => {
  if (typeof password !== 'string' || password.length < 8) {
    throw new AppError(
      'Password must be at least 8 characters.',
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
