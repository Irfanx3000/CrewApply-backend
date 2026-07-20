'use strict';

const mongoose = require('mongoose');

// The three subscription tiers, ordered by rank (used for gating: start < premium < elite).
const PLAN_TIERS = Object.freeze(['start', 'premium', 'elite']);
const BILLING_CYCLES = Object.freeze(['monthly', 'yearly']);

const planSchema = new mongoose.Schema(
  {
    // Tier + billing cycle uniquely identify a plan (6 docs total).
    tier: {
      type: String,
      required: true,
      enum: { values: PLAN_TIERS, message: 'Invalid plan tier.' },
    },
    billingCycle: {
      type: String,
      required: true,
      enum: { values: BILLING_CYCLES, message: 'Invalid billing cycle.' },
    },

    // Frontend id (e.g. 'crew-premium') + display copy.
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    subtitle: { type: String, trim: true, default: '' },

    // MONEY — stored in the smallest currency unit as an integer to avoid
    // floating-point errors (e.g. 34900 = ₹349.00 or $349.00). This is the server's
    // source of truth. Two region buckets, currency implied by the bucket (never
    // stored separately, so it can never drift out of sync with its region) — see
    // src/utils/pricingRegion.util.js for CURRENCY_BY_REGION / resolveRegion.
    pricing: {
      india: {
        amount: { type: Number, required: true, min: 0 }, // paise
        launchAmount: { type: Number, default: null, min: 0 }, // first-time promo price (optional)
      },
      global: {
        amount: { type: Number, required: true, min: 0 }, // cents
        launchAmount: { type: Number, default: null, min: 0 },
      },
    },

    // Access duration granted per successful payment.
    intervalDays: { type: Number, required: true, min: 1 },

    features: { type: [String], default: [] },

    // Future gating: max job applications per period (null = unlimited).
    jobApplicationLimit: { type: Number, default: null },

    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// One plan per (tier, cycle).
planSchema.index({ tier: 1, billingCycle: 1 }, { unique: true });
planSchema.index({ isActive: 1, displayOrder: 1 });

// Tier ranking for "at least this tier" checks (gating job-tier access and
// route-level minimum-tier requirements). Missing/unknown requiredTier
// defaults to the lowest tier ('start') — a job with no tier set should be
// applicable by anyone with an active subscription, not accidentally locked.
const TIER_RANK = { start: 1, premium: 2, elite: 3 };
const isTierSufficient = (userTier, requiredTier) =>
  (TIER_RANK[userTier] || 0) >= (TIER_RANK[requiredTier] || TIER_RANK.start);

module.exports = mongoose.model('Plan', planSchema);
module.exports.PLAN_TIERS = PLAN_TIERS;
module.exports.BILLING_CYCLES = BILLING_CYCLES;
module.exports.TIER_RANK = TIER_RANK;
module.exports.isTierSufficient = isTierSufficient;
