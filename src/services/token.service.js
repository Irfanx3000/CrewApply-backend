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

// ── Document View Token ───────────────────────────────────────────────────────
// Short-lived, single-document-scoped token — lets a document be opened by a
// URL alone (native "open externally"/<Image> flows can't attach a custom
// Authorization header), without exposing the file to anyone but its owner
// and without handing out a full-privilege access token in a URL.

/**
 * @param {string} userId
 * @param {string} documentId
 * @returns {string} Signed JWT, valid for 5 minutes, scoped to this one document.
 */
const signDocumentViewToken = (userId, documentId) => {
  return jwt.sign(
    { sub: userId.toString(), docId: documentId.toString(), type: TOKEN_TYPES.DOCUMENT_VIEW },
    config.jwt.accessSecret,
    { expiresIn: '5m' }
  );
};

/**
 * @param {string} token
 * @returns {{ sub: string, docId: string, type: string }}
 * @throws {AppError} When token is invalid or expired.
 */
const verifyDocumentViewToken = (token) => {
  try {
    const payload = jwt.verify(token, config.jwt.accessSecret);

    if (payload.type !== TOKEN_TYPES.DOCUMENT_VIEW) {
      throw new AppError(AUTH_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED, 'INVALID_TOKEN');
    }

    return payload;
  } catch (err) {
    if (err instanceof AppError) throw err;
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

  // Revoke ATOMICALLY, and treat losing the race as a race -- not as theft.
  //
  // This was previously a read-modify-save (set isRevoked, then save), which
  // left a window where two concurrent presentations of the SAME refresh token
  // could both observe isRevoked:false and both proceed to rotate. The loser
  // then came back through validateRefreshToken(), hit the reuse-detection
  // branch, and triggered its deliberately aggressive response:
  // RefreshToken.deleteMany({ userId }) -- every session on every device, gone.
  //
  // The mobile client queues concurrent 401s behind a single refresh, which
  // hides this in-process, but not across an app restart mid-refresh, a
  // background push handler waking the app, or a second device. The symptom is
  // the worst kind: a user silently signed out everywhere, with no way to
  // reproduce it.
  //
  // findOneAndUpdate with isRevoked:false in the FILTER makes exactly one
  // caller win. A null result means someone else already rotated this token
  // microseconds ago -- a benign race, not a stolen token -- so we surface it
  // as an ordinary "try again" rather than destroying the user's sessions.
  //
  // Genuine reuse detection is UNCHANGED and still fires: presenting an
  // already-revoked token still reaches validateRefreshToken's isRevoked check
  // and still wipes the token family. This narrows the false positive only.
  // No `new`/`returnDocument` option: only whether a document MATCHED matters,
  // and passing one raises a deprecation warning on Mongoose 9.
  const claimed = await RefreshToken.findOneAndUpdate(
    { _id: oldTokenDoc._id, isRevoked: false },
    { isRevoked: true, replacedByTokenHash: hashedToken }
  );

  if (!claimed) {
    throw new AppError(
      AUTH_MESSAGES.INVALID_REFRESH_TOKEN,
      HTTP_STATUS.UNAUTHORIZED,
      'REFRESH_IN_PROGRESS'
    );
  }

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
  signDocumentViewToken,
  verifyDocumentViewToken,
  createRefreshToken,
  validateRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
};
