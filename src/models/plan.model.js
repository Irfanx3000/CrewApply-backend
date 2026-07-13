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

    // MONEY — stored in the smallest currency unit (paise) as an integer to avoid
    // floating-point errors. e.g. 34900 = ₹349.00. This is the server's source of truth.
    amount: { type: Number, required: true, min: 0 }, // renewal / standard price
    launchAmount: { type: Number, default: null, min: 0 }, // first-time promo price (optional)
    currency: { type: String, default: 'INR', uppercase: true, trim: true },

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

module.exports = mongoose.model('Plan', planSchema);
module.exports.PLAN_TIERS = PLAN_TIERS;
module.exports.BILLING_CYCLES = BILLING_CYCLES;
