'use strict';

const crypto = require('crypto');
const User = require('../models/user.model');
const Payment = require('../models/payment.model');
const Referral = require('../models/referral.model');
const WalletTransaction = require('../models/walletTransaction.model');
const auditService = require('./audit.service');
const notificationService = require('./notification.service');
const walletService = require('./wallet.service');
const referralSettingService = require('./referralSetting.service');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');
const { AUDIT_EVENTS } = require('../constants/audit');
const { escapeRegex } = require('../utils/searchUtil');

const ctxOf = (req) => ({
  ipAddress: req?.ip || null,
  userAgent: req?.get?.('user-agent') || null,
});

const parsePagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
};

// ── Code generation ────────────────────────────────────────────────────────────

// Crockford base32 alphabet, minus visually-ambiguous characters (I/L/O/U/0/1
// already excluded from Crockford's own set) — short, shareable out loud,
// non-sequential, not derived from the ObjectId.
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'.replace(/[01]/g, '');
const CODE_LENGTH = 8;

const generateReferralCode = () => {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
};

// Retries on collision; the schema's unique index is the final backstop.
const generateUniqueReferralCode = async () => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    const exists = await User.exists({ referralCode: code });
    if (!exists) return code;
  }
  throw new Error('Could not generate a unique referral code after 5 attempts.');
};

// ── Attribution ────────────────────────────────────────────────────────────────

/**
 * Resolves a referral code entered at registration to its owner, or returns
 * null if the code is invalid/unusable — invalid codes soft-fail (a typo
 * shouldn't block signup) rather than throwing.
 */
const resolveReferrer = async (code, { email, phone }) => {
  if (!code) return null;

  const owner = await User.findOne({
    referralCode: String(code).trim().toUpperCase(),
    isActive: true,
    isDeleted: { $ne: true },
  });
  if (!owner) return null;

  // Self-referral guard: can't use a code belonging to the same identity
  // being registered (the trivial case — a different-device/same-person
  // farm attempt is a monthly-cap/fraud-review concern, not blocked here).
  if (owner.email === email || owner.phone === phone) return null;

  return owner;
};

/**
 * Creates the Referral row once the referee is phone-verified (called from
 * verifyMobile(), not register() — see auth.service.js — so a row is never
 * created for an account that might get deleted/re-registered before OTP
 * verification completes).
 */
const attribute = async (refereeUser, req) => {
  if (!refereeUser.referredBy) return null;

  try {
    const referral = await Referral.create({
      referrer: refereeUser.referredBy,
      referee: refereeUser._id,
      referralCode: (await User.findById(refereeUser.referredBy).select('referralCode'))?.referralCode,
      status: 'pending',
      signupContext: ctxOf(req),
    });

    auditService
      .log({ event: AUDIT_EVENTS.REFERRAL_ATTRIBUTED, userId: refereeUser._id, ...ctxOf(req), metadata: { referrer: refereeUser.referredBy } })
      .catch(() => {});

    notificationService
      .create({
        userId: refereeUser.referredBy,
        type: notificationService.NOTIFICATION_TYPES.REFERRAL_JOINED,
        title: 'Your friend joined CrewApply!',
        body: `${refereeUser.name} signed up using your referral code.`,
        data: { refereeId: refereeUser._id },
      })
      .catch(() => {});

    return referral;
  } catch (err) {
    // E11000 — this referee is already attributed to someone (the hard
    // security constraint doing its job). Not an error worth surfacing.
    if (err && err.code === 11000) return null;
    throw err;
  }
};

// ── Reward crediting (called from subscription.service.js's activate()) ───────

/**
 * Rewards the referrer once their referee's FIRST-EVER paid subscription
 * succeeds. Never throws — a referral-reward failure must not break
 * subscription activation (same fire-and-forget philosophy as this
 * codebase's admin notifications).
 */
const creditRewardForFirstPayment = async (paidPayment, req) => {
  const paidCount = await Payment.countDocuments({ user: paidPayment.user, status: 'paid' });
  if (paidCount !== 1) return; // a renewal, not this user's first payment — never re-rewards

  const referral = await Referral.findOne({ referee: paidPayment.user, status: 'pending' });
  if (!referral) return; // not a referred user, or already handled

  const settings = await referralSettingService.getSettings();

  if (!settings.enabled) {
    await Referral.updateOne({ _id: referral._id, status: 'pending' }, { $set: { status: 'qualified', qualifiedAt: new Date() } });
    auditService.log({ event: AUDIT_EVENTS.REFERRAL_REWARD_SKIPPED, userId: referral.referrer, ...ctxOf(req), metadata: { referralId: referral._id, reason: 'disabled' } }).catch(() => {});
    return;
  }

  if (settings.maxRewardsPerMonth > 0) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const rewardedThisMonth = await WalletTransaction.countDocuments({
      user: referral.referrer,
      type: 'referral_reward',
      createdAt: { $gte: monthStart },
    });
    if (rewardedThisMonth >= settings.maxRewardsPerMonth) {
      await Referral.updateOne({ _id: referral._id, status: 'pending' }, { $set: { status: 'qualified', qualifiedAt: new Date() } });
      auditService.log({ event: AUDIT_EVENTS.REFERRAL_REWARD_CAPPED, userId: referral.referrer, ...ctxOf(req), metadata: { referralId: referral._id } }).catch(() => {});
      return;
    }
  }

  const now = new Date();
  const claimed = await Referral.findOneAndUpdate(
    { _id: referral._id, status: 'pending' },
    { $set: { status: 'rewarded', rewardAmount: settings.rewardAmount, rewardedAt: now } },
    { new: true }
  );
  if (!claimed) return; // lost a concurrency race — someone else already handled this row

  const { transaction } = await walletService.credit({
    user: claimed.referrer,
    amount: settings.rewardAmount,
    type: 'referral_reward',
    referral: claimed._id,
    description: 'Referral reward — referred friend subscribed',
  });
  await Referral.updateOne({ _id: claimed._id }, { $set: { walletTransaction: transaction._id } });

  auditService.log({ event: AUDIT_EVENTS.REFERRAL_REWARDED, userId: claimed.referrer, ...ctxOf(req), metadata: { referralId: claimed._id, amount: settings.rewardAmount } }).catch(() => {});
  auditService.log({ event: AUDIT_EVENTS.WALLET_CREDITED, userId: claimed.referrer, ...ctxOf(req), metadata: { amount: settings.rewardAmount, transactionId: transaction._id } }).catch(() => {});

  notificationService
    .create({
      userId: claimed.referrer,
      type: notificationService.NOTIFICATION_TYPES.REFERRAL_REWARDED,
      title: 'You earned a referral reward!',
      body: `You earned ₹${(settings.rewardAmount / 100).toFixed(0)} wallet credit — your referred friend just subscribed.`,
      data: { referralId: claimed._id, amount: settings.rewardAmount },
    })
    .catch(() => {});
};

// ── User-facing ────────────────────────────────────────────────────────────────

const getMyReferral = async (user) => {
  // No auto-generation here — a user's code is only created when they
  // explicitly tap "Generate Code" (see generateCode() below). `code` stays
  // null until then, so the mobile screen can show that action instead of a
  // pre-filled code.
  const code = user.referralCode || null;

  const [invited, qualified, rewarded, history] = await Promise.all([
    Referral.countDocuments({ referrer: user._id }),
    Referral.countDocuments({ referrer: user._id, status: { $in: ['qualified', 'rewarded'] } }),
    Referral.countDocuments({ referrer: user._id, status: 'rewarded' }),
    Referral.find({ referrer: user._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('referee', 'name')
      .lean(),
  ]);

  return {
    code,
    shareMessage: code ? `Join CrewApply and find your next sea opportunity! Use my referral code ${code} when you sign up.` : null,
    walletBalance: user.walletBalance || 0,
    stats: { invited, qualified, rewarded },
    history: history.map((r) => ({
      id: r._id,
      refereeName: r.referee?.name || 'A new user',
      status: r.status,
      rewardAmount: r.rewardAmount,
      createdAt: r.createdAt,
    })),
  };
};

// Explicit "Generate Code" action — idempotent (returns the existing code if
// one was already generated, never overwrites it with a new one).
const generateCode = async (user) => {
  if (user.referralCode) return user.referralCode;

  const code = await generateUniqueReferralCode();
  await User.updateOne({ _id: user._id, referralCode: null }, { $set: { referralCode: code } });

  // Re-read in case of a race (two concurrent taps) — the loser's update
  // matched nothing (referralCode was no longer null), so read back whatever
  // actually landed rather than trusting the code this call generated.
  const fresh = await User.findById(user._id).select('referralCode');
  return fresh.referralCode;
};

// ── Admin ─────────────────────────────────────────────────────────────────────

const presentAdminReferral = (r) => ({
  id: r._id,
  referrer: r.referrer && typeof r.referrer === 'object'
    ? { id: r.referrer._id, name: r.referrer.name, email: r.referrer.email, avatar: r.referrer.avatar }
    : null,
  referralCode: r.referralCode,
  referee: r.referee && typeof r.referee === 'object' ? { id: r.referee._id, name: r.referee.name, email: r.referee.email } : null,
  status: r.status,
  rewardAmount: r.rewardAmount,
  qualifiedAt: r.qualifiedAt,
  rewardedAt: r.rewardedAt,
  createdAt: r.createdAt,
});

const listReferrals = async (query) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  if (query.status) filter.status = query.status;

  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search.trim()), 'i');
    const matchingUsers = await User.find({ $or: [{ name: rx }, { email: rx }] }).select('_id').lean();
    const userIds = matchingUsers.map((u) => u._id);
    filter.$or = [{ referralCode: rx }, { referrer: { $in: userIds } }];
  }

  const [referrals, total] = await Promise.all([
    Referral.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('referrer', 'name email avatar')
      .populate('referee', 'name email')
      .lean(),
    Referral.countDocuments(filter),
  ]);

  return { referrals: referrals.map(presentAdminReferral), page, limit, total };
};

const getReferralStats = async () => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [total, qualified, rewarded, payoutAgg, monthPayoutAgg] = await Promise.all([
    Referral.countDocuments({}),
    Referral.countDocuments({ status: 'qualified' }),
    Referral.countDocuments({ status: 'rewarded' }),
    WalletTransaction.aggregate([{ $match: { type: 'referral_reward' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    WalletTransaction.aggregate([
      { $match: { type: 'referral_reward', createdAt: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  return {
    total,
    qualified,
    rewarded,
    totalPayout: payoutAgg[0]?.total || 0,
    payoutThisMonth: monthPayoutAgg[0]?.total || 0,
  };
};

const setReferralStatus = async (id, status, adminId, req) => {
  const referral = await Referral.findByIdAndUpdate(id, { $set: { status } }, { new: true })
    .populate('referrer', 'name email avatar')
    .populate('referee', 'name email');
  if (!referral) {
    throw new AppError(AUTH_MESSAGES.REFERRAL_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  auditService
    .log({ event: AUDIT_EVENTS.REFERRAL_STATUS_CHANGED, userId: adminId, ...ctxOf(req), metadata: { referralId: referral._id, status } })
    .catch(() => {});

  return presentAdminReferral(referral.toObject());
};

module.exports = {
  generateUniqueReferralCode,
  resolveReferrer,
  attribute,
  creditRewardForFirstPayment,
  getMyReferral,
  generateCode,
  listReferrals,
  getReferralStats,
  setReferralStatus,
};
