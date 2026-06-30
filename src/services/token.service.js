'use strict';

const jwt = require('jsonwebtoken');
const { config } = require('../config');
const { TOKEN_TYPES } = require('../constants/tokens');
const { generateTokenPair, hashToken } = require('../utils/crypto.util');
const RefreshToken = require('../models/refreshToken.model');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

// ── Access Token ──────────────────────────────────────────────────────────────

/**
 * Signs a short-lived access token for a user.
 *
 * @param {{ _id: string, role: string }} user
 * @returns {string} Signed JWT access token.
 */
const signAccessToken = (user) => {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, type: TOKEN_TYPES.ACCESS },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpiresIn }
  );
};

/**
 * Verifies an access token and returns the decoded payload.
 *
 * @param {string} token
 * @returns {{ sub: string, role: string, type: string }}
 * @throws {AppError} When token is invalid or expired.
 */
const verifyAccessToken = (token) => {
  try {
    const payload = jwt.verify(token, config.jwt.accessSecret);

    if (payload.type !== TOKEN_TYPES.ACCESS) {
      throw new AppError(AUTH_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED, 'INVALID_TOKEN');
    }

    return payload;
  } catch (err) {
    if (err instanceof AppError) throw err;

    if (err.name === 'TokenExpiredError') {
      throw new AppError('Access token has expired.', HTTP_STATUS.UNAUTHORIZED, 'TOKEN_EXPIRED');
    }

    throw new AppError(AUTH_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED, 'INVALID_TOKEN');
  }
};

// ── Refresh Token ─────────────────────────────────────────────────────────────

/**
 * Creates a new opaque refresh token, stores its hash in the database,
 * and returns the raw token to be sent to the client.
 *
 * @param {string} userId
 * @param {{ userAgent?: string, ipAddress?: string }} [context={}]
 * @returns {Promise<string>} Raw refresh token.
 */
const createRefreshToken = async (userId, context = {}) => {
  const { rawToken, hashedToken } = generateTokenPair(40);

  await RefreshToken.create({
    userId,
    tokenHash: hashedToken,
    userAgent: context.userAgent || null,
    ipAddress: context.ipAddress || null,
    expiresAt: RefreshToken.buildExpiresAt(),
  });

  return rawToken;
};

/**
 * Validates an incoming refresh token.
 * Handles token-reuse detection: if the token is revoked, all tokens for
 * the associated user are invalidated (theft assumed).
 *
 * @param {string} rawToken
 * @returns {Promise<import('../models/refreshToken.model')>} The valid token document.
 * @throws {AppError}
 */
const validateRefreshToken = async (rawToken) => {
  if (!rawToken) {
    throw new AppError(AUTH_MESSAGES.INVALID_REFRESH_TOKEN, HTTP_STATUS.UNAUTHORIZED, 'INVALID_REFRESH_TOKEN');
  }

  const tokenHash = hashToken(rawToken);
  const tokenDoc = await RefreshToken.findOne({ tokenHash });

  if (!tokenDoc) {
    throw new AppError(AUTH_MESSAGES.INVALID_REFRESH_TOKEN, HTTP_STATUS.UNAUTHORIZED, 'INVALID_REFRESH_TOKEN');
  }

  // Token reuse detected — a previously revoked token is being presented.
  if (tokenDoc.isRevoked) {
    await RefreshToken.deleteMany({ userId: tokenDoc.userId });
    throw new AppError(AUTH_MESSAGES.TOKEN_REUSE_DETECTED, HTTP_STATUS.UNAUTHORIZED, 'TOKEN_REUSE_DETECTED');
  }

  if (tokenDoc.expiresAt < new Date()) {
    await tokenDoc.deleteOne();
    throw new AppError(AUTH_MESSAGES.INVALID_REFRESH_TOKEN, HTTP_STATUS.UNAUTHORIZED, 'REFRESH_TOKEN_EXPIRED');
  }

  return tokenDoc;
};

/**
 * Rotates a refresh token:
 * 1. Marks the old token as revoked (not deleted — kept for reuse detection).
 * 2. Issues and persists a new refresh token.
 *
 * @param {import('../models/refreshToken.model')} oldTokenDoc
 * @param {{ userAgent?: string, ipAddress?: string }} [context={}]
 * @returns {Promise<string>} New raw refresh token.
 */
const rotateRefreshToken = async (oldTokenDoc, context = {}) => {
  const { rawToken, hashedToken } = generateTokenPair(40);

  // Mark old token as revoked and record the replacement for audit purposes.
  oldTokenDoc.isRevoked = true;
  oldTokenDoc.replacedByTokenHash = hashedToken;
  await oldTokenDoc.save();

  await RefreshToken.create({
    userId: oldTokenDoc.userId,
    tokenHash: hashedToken,
    userAgent: context.userAgent || oldTokenDoc.userAgent,
    ipAddress: context.ipAddress || oldTokenDoc.ipAddress,
    expiresAt: RefreshToken.buildExpiresAt(),
  });

  return rawToken;
};

/**
 * Revokes a single refresh token by its raw value.
 *
 * @param {string} rawToken
 * @returns {Promise<boolean>} True when a token was found and revoked.
 */
const revokeRefreshToken = async (rawToken) => {
  if (!rawToken) return false;

  const tokenHash = hashToken(rawToken);
  const result = await RefreshToken.findOneAndUpdate(
    { tokenHash, isRevoked: false },
    { isRevoked: true },
    { new: false }
  );

  return result !== null;
};

/**
 * Revokes all refresh tokens belonging to a user.
 * Used on logout-all and password change/reset.
 *
 * @param {string} userId
 * @returns {Promise<number>} Number of tokens revoked.
 */
const revokeAllRefreshTokens = async (userId) => {
  const result = await RefreshToken.deleteMany({ userId });
  return result.deletedCount;
};

module.exports = {
  signAccessToken,
  verifyAccessToken,
  createRefreshToken,
  validateRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
};
