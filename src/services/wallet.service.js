'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/user.model');
const WalletTransaction = require('../models/walletTransaction.model');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

// The one place wallet balances actually move. Every mutation goes through
// here so User.walletBalance (a denormalized fast-read cache) and the
// WalletTransaction ledger (the source of truth) can never drift apart —
// both are updated atomically in the same call.

// Human-readable id shown on the transaction detail view, distinct from
// Mongo's _id. 5 bytes (40 bits) of entropy — same no-retry-on-collision
// convention already used for receipt/order ids elsewhere in this codebase
// (e.g. subscription.service.js's `rcpt_${crypto.randomBytes(10)...}`);
// collision odds at this app's scale are negligible.
const generateReferenceId = () => `WTX-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

/**
 * Credits a user's wallet (positive ledger entry) — e.g. a referral reward.
 * @param {{ user: ObjectId, amount: number, type: string, referral?: ObjectId, description?: string, createdBy?: ObjectId }} params
 */
const credit = async ({ user, amount, type, referral = null, description = '', createdBy = null }) => {
  if (!(amount > 0)) throw new Error('wallet.credit: amount must be positive.');

  const updated = await User.findByIdAndUpdate(user, { $inc: { walletBalance: amount } }, { new: true }).select('walletBalance');

  const transaction = await WalletTransaction.create({
    user,
    referenceId: generateReferenceId(),
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
    referenceId: generateReferenceId(),
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
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
  const skip = (pageNum - 1) * limitNum;
  const [transactions, total] = await Promise.all([
    WalletTransaction.find({ user: userId }).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    WalletTransaction.countDocuments({ user: userId }),
  ]);
  return { transactions, page: pageNum, limit: limitNum, total };
};

// Stats for the Wallet home screen — one aggregate rather than two, since
// both credited/debited totals come off the same signed-amount field.
const getStats = async (userId) => {
  const agg = await WalletTransaction.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(String(userId)) } },
    {
      $group: {
        _id: null,
        totalCredited: { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } },
        totalDebited: { $sum: { $cond: [{ $lt: ['$amount', 0] }, { $abs: '$amount' }, 0] } },
      },
    },
  ]);
  return {
    totalCredited: agg[0]?.totalCredited || 0,
    totalDebited: agg[0]?.totalDebited || 0,
    pendingCredits: 0, // no pending state exists yet — see walletTransaction.model.js's status field
  };
};

// Ownership-checked single-transaction lookup for the detail sheet.
// Populates `payment` so the presentation layer can derive payment
// method / related subscription / invoice reference without new stored fields.
const getTransactionById = async (userId, id) => {
  const transaction = await WalletTransaction.findOne({ _id: id, user: userId })
    .populate({ path: 'payment', populate: { path: 'subscription' } })
    .lean();
  if (!transaction) {
    throw new AppError(AUTH_MESSAGES.WALLET_TRANSACTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }
  return transaction;
};

module.exports = { credit, redeem, getBalance, getHistory, getStats, getTransactionById };
