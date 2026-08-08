'use strict';

const mongoose = require('mongoose');

const SUBSCRIPTION_STATUSES = Object.freeze(['pending', 'active', 'expired', 'cancelled']);

const subscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      required: true,
    },

    // Snapshots at purchase time — so gating survives later admin edits to the plan.
    tier: { type: String, required: true },
    billingCycle: { type: String, required: true },

    status: {
      type: String,
      enum: { values: SUBSCRIPTION_STATUSES, message: 'Invalid subscription status.' },
      default: 'active',
    },

    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },

    // Origin of the application-quota cadence. Quota windows are fixed
    // `plan.intervalDays` slices measured forward from this instant, so a plan
    // bought on 20 Feb resets on 20 Mar, 20 Apr, and so on.
    //
    // CARRIED FORWARD UNCHANGED ON RENEWAL, and only reset on a first purchase
    // or a plan switch. That distinction is load-bearing: renewals are allowed
    // up to 7 days early and stack their time onto the old period, so anchoring
    // to the new subscription's own currentPeriodStart would advance the reset
    // 7 days early every cycle — ~15.9 quota windows a year against 12
    // payments on a monthly plan. Anchoring the cadence instead of the document
    // keeps resets on a stable date no matter when the user renews.
    quotaAnchor: { type: Date, default: null },

    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
    },

    autoRenew: { type: Boolean, default: false }, // reserved for a future recurring model

    // Set once the "expiring soon" reminder has been sent for THIS billing
    // period (see src/jobs/subscriptionExpiry.job.js) — prevents the daily
    // cron from re-notifying the same user every day inside the renewal
    // window. Reset never happens automatically; a new period comes from a
    // new Subscription document (see createOrder), not a mutation of this one.
    renewalNotifiedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

subscriptionSchema.index({ user: 1, status: 1 });
subscriptionSchema.index({ currentPeriodEnd: 1 });

// True only while genuinely active AND unexpired.
subscriptionSchema.methods.isCurrentlyActive = function isCurrentlyActive() {
  return this.status === 'active' && this.currentPeriodEnd > new Date();
};

module.exports = mongoose.model('Subscription', subscriptionSchema);
module.exports.SUBSCRIPTION_STATUSES = SUBSCRIPTION_STATUSES;
