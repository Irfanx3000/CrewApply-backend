'use strict';

const User = require('../models/user.model');
const { verifyAccessToken } = require('../services/token.service');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');
const { BEARER_PREFIX } = require('../constants/tokens');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Authentication middleware.
 *
 * Verifies the Bearer access token in the Authorization header, then fetches
 * the current user from the database to ensure the data is always fresh
 * (role changes, account deactivation, and locks are picked up immediately).
 *
 * Attaches the full user document to `req.user`.
 *
 * Future enhancement: replace the DB lookup with a Redis cache keyed by
 * userId to reduce latency at high scale.
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
    throw new AppError(AUTH_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED, 'UNAUTHORIZED');
  }

  const token = authHeader.slice(BEARER_PREFIX.length);
  const payload = verifyAccessToken(token);

  const user = await User.findById(payload.sub).select('-__v');

  if (!user) {
    throw new AppError(AUTH_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED, 'UNAUTHORIZED');
  }

  // Checked separately (not a single OR) so the client can tell blocked and
  // deleted apart and word the mid-session sign-out message accordingly.
  // Deleted first: setStatus('deleted') also sets isActive false, so deleted
  // must win over the generic blocked fallback.
  if (user.isDeleted) {
    throw new AppError(AUTH_MESSAGES.ACCOUNT_DELETED, HTTP_STATUS.FORBIDDEN, 'ACCOUNT_DELETED');
  }
  if (!user.isActive) {
    throw new AppError(AUTH_MESSAGES.ACCOUNT_BLOCKED, HTTP_STATUS.FORBIDDEN, 'ACCOUNT_BLOCKED');
  }

  req.user = user;
  next();
});

module.exports = authenticate;
