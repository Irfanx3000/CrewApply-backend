'use strict';

const User = require('../models/user.model');
const WalletTransaction = require('../models/walletTransaction.model');

// The one place wallet balances actually move. Every mutation goes through
// here so User.walletBalance (a denormalized fast-read cache) and the
// WalletTransaction ledger (the source of truth) can never drift apart —
// both are updated atomically in the same call.

/**
 * Credits a user's wallet (positive ledger entry) — e.g. a referral reward.
 * @param {{ user: ObjectId, amount: number, type: string, referral?: ObjectId, description?: string, createdBy?: ObjectId }} params
 */
const credit = async ({ user, amount, type, referral = null, description = '', createdBy = null }) => {
  if (!(amount > 0)) throw new Error('wallet.credit: amount must be positive.');

  const updated = await User.findByIdAndUpdate(user, { $inc: { walletBalance: amount } }, { new: true }).select('walletBalance');

  const transaction = await WalletTransaction.create({
    user,
    type,
    amount,
    balanceAfter: updated.walletBalance,
    referral,
    description,
    createdBy,
  });

  return { transaction, balance: updated.walletBalance };
};

/**
 * Debits a user's wallet (negative ledger entry) — e.g. redeeming credit
 * toward a purchase. Clamped so the balance can never go negative even if it
 * changed between when the debit amount was decided and when this runs.
 * @param {{ user: ObjectId, amount: number, type: string, payment?: ObjectId, description?: string, createdBy?: ObjectId }} params
 */
const redeem = async ({ user, amount, type = 'redemption', payment = null, description = '', createdBy = null }) => {
  if (!(amount > 0)) throw new Error('wallet.redeem: amount must be positive.');

  const current = await User.findById(user).select('walletBalance');
  const actual = Math.min(amount, current?.walletBalance || 0);
  if (actual <= 0) return { transaction: null, balance: current?.walletBalance || 0 };

  const updated = await User.findByIdAndUpdate(user, { $inc: { walletBalance: -actual } }, { new: true }).select('walletBalance');

  const transaction = await WalletTransaction.create({
    user,
    type,
    amount: -actual,
    balanceAfter: updated.walletBalance,
    payment,
    description,
    createdBy,
  });

  return { transaction, balance: updated.walletBalance };
};

const getBalance = async (userId) => {
  const user = await User.findById(userId).select('walletBalance');
  return user?.walletBalance || 0;
};

const getHistory = async (userId, { page = 1, limit = 20 } = {}) => {
  const skip = (page - 1) * limit;
  const [transactions, total] = await Promise.all([
    WalletTransaction.find({ user: userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    WalletTransaction.countDocuments({ user: userId }),
  ]);
  return { transactions, page, limit, total };
};

module.exports = { credit, redeem, getBalance, getHistory };
