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

    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
    },

    autoRenew: { type: Boolean, default: false }, // reserved for a future recurring model
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
