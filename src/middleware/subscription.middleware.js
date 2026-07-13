'use strict';

const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

// Tier ranking for "at least this tier" checks.
const TIER_RANK = { start: 1, premium: 2, elite: 3 };

// True if req.user's cached entitlement is active and unexpired. Zero extra query
// — authenticate already loaded req.user with subscription* fields.
const hasActive = (user) =>
  Boolean(user && user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) > new Date());

/**
 * Gate a route behind ANY active subscription. Use AFTER `authenticate`.
 * Returns 402 Payment Required when the user has no live subscription.
 */
const requireActiveSubscription = (req, res, next) => {
  if (!hasActive(req.user)) {
    return next(
      new AppError(AUTH_MESSAGES.SUBSCRIPTION_REQUIRED, HTTP_STATUS.PAYMENT_REQUIRED, 'SUBSCRIPTION_REQUIRED')
    );
  }
  next();
};

/**
 * Gate a route behind a MINIMUM tier (start < premium < elite). Use AFTER `authenticate`.
 * @param {'start'|'premium'|'elite'} minTier
 */
const requireTier = (minTier) => (req, res, next) => {
  if (!hasActive(req.user)) {
    return next(
      new AppError(AUTH_MESSAGES.SUBSCRIPTION_REQUIRED, HTTP_STATUS.PAYMENT_REQUIRED, 'SUBSCRIPTION_REQUIRED')
    );
  }
  const have = TIER_RANK[req.user.subscriptionTier] || 0;
  const need = TIER_RANK[minTier] || 0;
  if (have < need) {
    return next(
      new AppError(AUTH_MESSAGES.SUBSCRIPTION_TIER_REQUIRED, HTTP_STATUS.PAYMENT_REQUIRED, 'TIER_REQUIRED')
    );
  }
  next();
};

module.exports = { hasActive, requireActiveSubscription, requireTier };
