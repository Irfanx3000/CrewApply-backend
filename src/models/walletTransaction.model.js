'use strict';

const mongoose = require('mongoose');

// referral_reward — credit, fires when a referred friend's first payment succeeds.
// redemption      — debit, wallet balance applied toward a subscription purchase.
// adjustment      — admin manual credit/debit (support cases, goodwill, corrections).
const WALLET_TRANSACTION_TYPES = Object.freeze(['referral_reward', 'redemption', 'adjustment']);

const walletTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: { values: WALLET_TRANSACTION_TYPES, message: 'Invalid wallet transaction type.' },
      required: true,
    },

    // Paise. SIGNED: positive = credit, negative = debit. User.walletBalance
    // is the sum of this field across a user's transactions — this collection
    // is the source of truth, walletBalance is a denormalized fast-read cache
    // (same pattern as Subscription -> User.subscriptionTier elsewhere).
    amount: { type: Number, required: true },

    // Snapshot of the running balance immediately after this entry — makes
    // the ledger self-auditing without replaying the whole history.
    balanceAfter: { type: Number, required: true },

    referral: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Referral',
      default: null, // set for 'referral_reward'
    },

    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null, // set for 'redemption' — ties the debit to the specific order it paid for
    },

    description: { type: String, default: '' },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // the admin who made an 'adjustment'
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

walletTransactionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
module.exports.WALLET_TRANSACTION_TYPES = WALLET_TRANSACTION_TYPES;
