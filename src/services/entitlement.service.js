'use strict';

const Subscription = require('../models/subscription.model');

// The single authority for "is this user entitled RIGHT NOW".
//
// Deliberately tiny and dependency-free (one model, nothing else) so it can be
// required from anywhere — including the resume render path — without dragging
// in razorpay/email/notification the way subscription.service.js would, and
// with no chance of a circular require.
//
// Reads the Subscription collection directly rather than User.subscriptionTier.
// That field is a denormalized cache kept for cheap per-request gating; it is
// written on activation and swept on expiry, which means there is a window
// where it can say "premium" for a subscription that has already lapsed.
// Cheap gating can tolerate that. Deciding whether a document leaves this
// system watermarked cannot — so this pays for the extra query and asks the
// source of truth, applying the same status+expiry predicate the rest of the
// codebase uses (see application.service.js's getApplicationUsage).

/**
 * @param {string|ObjectId} userId
 * @returns {Promise<boolean>} true only while a subscription is both `active`
 *   and unexpired. Any error propagates — callers must NOT treat a failed
 *   lookup as "entitled" (see resumeRender.service.js).
 */
const hasActiveSubscription = async (userId) => {
  if (!userId) return false;
  const active = await Subscription.exists({
    user: userId,
    status: 'active',
    currentPeriodEnd: { $gt: new Date() },
  });
  return !!active;
};

module.exports = { hasActiveSubscription };
