'use strict';

const { config } = require('../config');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

/**
 * Verifies a Google ID token and returns the normalised user payload.
 *
 * The frontend (web or mobile) obtains the ID token via the Google Sign-In
 * SDK and sends it to this endpoint. The backend verifies authenticity
 * using google-auth-library, then creates or logs in the user.
 *
 * @param {string} idToken - Google ID token from the client.
 * @returns {Promise<{ googleId: string, email: string, name: string, emailVerified: boolean, avatar: string|null }>}
 * @throws {AppError} When Google client ID is not configured or token is invalid.
 */
const verifyGoogleIdToken = async (idToken) => {
  if (!config.google.clientId) {
    throw new AppError(
      AUTH_MESSAGES.GOOGLE_CLIENT_NOT_CONFIGURED,
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      'GOOGLE_NOT_CONFIGURED'
    );
  }

  const { OAuth2Client } = require('google-auth-library');
  const client = new OAuth2Client(config.google.clientId);

  let payload;

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: config.google.clientId,
    });
    payload = ticket.getPayload();
  } catch {
    throw new AppError(
      AUTH_MESSAGES.GOOGLE_TOKEN_INVALID,
      HTTP_STATUS.UNAUTHORIZED,
      'GOOGLE_TOKEN_INVALID'
    );
  }

  if (!payload || !payload.email) {
    throw new AppError(
      AUTH_MESSAGES.GOOGLE_TOKEN_INVALID,
      HTTP_STATUS.UNAUTHORIZED,
      'GOOGLE_TOKEN_INVALID'
    );
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase().trim(),
    name: payload.name || payload.email.split('@')[0],
    emailVerified: payload.email_verified === true,
    avatar: payload.picture || null,
  };
};

module.exports = { verifyGoogleIdToken };
