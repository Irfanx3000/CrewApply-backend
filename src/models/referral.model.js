'use strict';

const mongoose = require('mongoose');

// pending    — referee attributed at signup, no qualifying payment yet.
// qualified  — referee made their first paid subscription, but payout was
//              suppressed (monthly cap hit, or the program was disabled).
//              The qualifying event is recorded; nothing was paid out.
// rewarded   — reward credited to the referrer's wallet. Terminal happy path.
// rejected   — admin-voided / fraud-flagged. Terminal.
const REFERRAL_STATUSES = Object.freeze(['pending', 'qualified', 'rewarded', 'rejected']);

const referralSchema = new mongoose.Schema(
  {
    referrer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // A referee can be attributed to at most ONE referrer, ever — enforced by
    // the unique index below at the database level, not just application
    // logic. A code itself stays reusable by many different friends; this is
    // what stops the same person being (re-)attributed to multiple referrers.
    referee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Snapshot of the code actually used — the referrer's own code may change
    // later (regeneration isn't planned today, but this keeps history honest
    // if it ever is).
    referralCode: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: { values: REFERRAL_STATUSES, message: 'Invalid referral status.' },
      default: 'pending',
      index: true,
    },

    rewardAmount: { type: Number, default: 0, min: 0 }, // paise, set when rewarded

    walletTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WalletTransaction',
      default: null,
    },

    qualifiedAt: { type: Date, default: null },
    rewardedAt: { type: Date, default: null },

    // Fraud-review trail — captured at attribution time.
    signupContext: {
      ipAddress: { type: String, default: null },
      userAgent: { type: String, default: null },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// The hard security constraint: one referrer per referee, forever.
referralSchema.index({ referee: 1 }, { unique: true });
referralSchema.index({ referrer: 1, status: 1 });
referralSchema.index({ referrer: 1, createdAt: -1 });

module.exports = mongoose.model('Referral', referralSchema);
module.exports.REFERRAL_STATUSES = REFERRAL_STATUSES;
