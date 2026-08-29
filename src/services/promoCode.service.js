'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Payment = require('../models/payment.model');
const PromoCode = require('../models/promoCode.model');
const auditService = require('./audit.service');
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

// ── Code generation ───────────────────────────────────────────────────────────

// Same ambiguity-free alphabet as referral.service.js — these codes get read
// aloud in videos and typed off a screenshot, so O/0 and I/1 confusion is a
// support ticket, not a curiosity.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 6;

// Influencer codes are short and derived from the influencer's own name where
// possible (SARAH24 reads better in a caption than 7KQ9XB), falling back to
// random when the name yields nothing usable.
const generateUniquePromoCode = async (influencerName = '') => {
  const stem = String(influencerName)
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 6);

  for (let attempt = 0; attempt < 6; attempt++) {
    const bytes = crypto.randomBytes(CODE_LENGTH);
    let random = '';
    for (let i = 0; i < CODE_LENGTH; i++) random += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];

    // First two attempts try the readable name-based form, then give up on
    // pretty and take randomness — a signup must never block on aesthetics.
    const code = attempt < 2 && stem.length >= 3 ? `${stem}${random.slice(0, 2)}` : random;

    const exists = await PromoCode.exists({ code });
    if (!exists) return code;
  }
  throw new Error('Could not generate a unique promo code after 6 attempts.');
};

// ── Attribution (signup path) ─────────────────────────────────────────────────

/**
 * Resolves a code typed at registration to a usable PromoCode, or null.
 *
 * Called by auth.service.js's register() ONLY after resolveReferrer() has
 * already missed, so one signup input transparently accepts either kind of
 * code. Like referral resolution, an unusable code soft-fails rather than
 * throwing — a typo, an expired campaign or a sold-out code must never block
 * someone from creating an account.
 */
const resolveByCode = async (code) => {
  if (!code) return null;

  const promo = await PromoCode.findOne({
    code: String(code).trim().toUpperCase(),
    isActive: true,
  });
  if (!promo) return null;

  if (promo.expiresAt && promo.expiresAt.getTime() <= Date.now()) return null;
  if (promo.usageLimit > 0 && promo.usageCount >= promo.usageLimit) return null;

  return promo;
};

/**
 * Records the signup against the code. Called from verifyMobile() — the same
 * point referral attribution happens — so an abandoned, never-verified
 * registration never burns a slot on a limited code.
 *
 * The counter is advanced with a CONDITIONAL $inc rather than a read-modify-
 * write: two people redeeming the last slot of a limited code concurrently
 * would both pass the check in resolveByCode(), and only the conditional
 * update makes the database itself pick a winner.
 */
const attribute = async (user, req) => {
  if (!user.promoCode) return null;

  const promo = await PromoCode.findById(user.promoCode);
  if (!promo) return null;

  const filter = { _id: promo._id };
  if (promo.usageLimit > 0) filter.usageCount = { $lt: promo.usageLimit };

  const claimed = await PromoCode.findOneAndUpdate(filter, { $inc: { usageCount: 1 } }, { new: true });

  if (!claimed) {
    // The code filled up between signup and verification. Detach it so this
    // user is never counted against, or discounted by, a code they didn't
    // actually get a slot on.
    await User.updateOne({ _id: user._id }, { $set: { promoCode: null } });
    return null;
  }

  auditService
    .log({
      event: AUDIT_EVENTS.PROMO_CODE_APPLIED,
      userId: user._id,
      ...ctxOf(req),
      metadata: { promoCodeId: claimed._id, code: claimed.code },
    })
    .catch(() => {});

  return claimed;
};

// ── Pricing (order-creation path) ─────────────────────────────────────────────

/**
 * Discount to apply to `baseAmount` for this buyer, plus the code it came
 * from. Returns a zero discount and a null code whenever the promo doesn't
 * apply, so the caller never needs to branch.
 *
 * The perk is deliberately a FIRST-PURCHASE benefit, mirroring the existing
 * `launchAmount` behaviour in plan.model.js: it is an acquisition incentive
 * the influencer is paid a commission for, not an open-ended subscription
 * price cut. `alreadyConverted` is therefore measured the same way — has this
 * user ever completed a paid subscription order before.
 */
const quoteDiscount = async (user, baseAmount) => {
  const none = { promo: null, discount: 0 };

  if (!user?.promoCode || !(baseAmount > 0)) return none;

  const promo = await PromoCode.findById(user.promoCode);
  if (!promo || !promo.isActive) return none;
  if (promo.expiresAt && promo.expiresAt.getTime() <= Date.now()) return none;

  const alreadyConverted = await Payment.exists({
    user: user._id,
    type: 'subscription',
    status: 'paid',
  });
  if (alreadyConverted) return none;

  return { promo, discount: promo.discountFor(baseAmount) };
};

/**
 * Freezes the commission owed on a confirmed payment. Called from
 * subscription.service.js's activate(), after the order is 'paid'.
 *
 * Computed from `paid.amount` — the cash Razorpay actually collected, after
 * wallet credit and proration — never from the plan's list price. Paying a
 * percentage of money that never arrived would let a buyer with wallet credit
 * generate commission out of nothing.
 *
 * Never throws: a commission-accounting failure must not undo an activation
 * the user already paid for (same contract as the referral reward hook).
 */
const recordCommission = async (paid, req) => {
  if (!paid.promoCode || !(paid.amount > 0)) return;
  if (paid.promoCommission > 0) return; // already recorded — activate() is idempotent

  const promo = await PromoCode.findById(paid.promoCode);
  if (!promo) return;

  const commission = promo.commissionFor(paid.amount);
  if (!(commission > 0)) return;

  await Payment.updateOne({ _id: paid._id }, { $set: { promoCommission: commission } });

  auditService
    .log({
      event: AUDIT_EVENTS.PROMO_COMMISSION_ACCRUED,
      userId: paid.user,
      ...ctxOf(req),
      metadata: { promoCodeId: promo._id, code: promo.code, paymentId: paid._id, commission },
    })
    .catch(() => {});
};

// ── Admin: analytics ──────────────────────────────────────────────────────────

// Signups and conversions come from two different collections (User for
// attribution, Payment for money), so they're aggregated separately and
// stitched by promo id. Two grouped queries over indexed fields, rather than
// N+1 per-influencer counts.
const statsByPromo = async (promoIds) => {
  const ids = promoIds.map((id) => new mongoose.Types.ObjectId(String(id)));

  const [signupRows, revenueRows] = await Promise.all([
    User.aggregate([
      { $match: { promoCode: { $in: ids } } },
      { $group: { _id: '$promoCode', signups: { $sum: 1 } } },
    ]),
    Payment.aggregate([
      { $match: { promoCode: { $in: ids }, status: 'paid' } },
      {
        $group: {
          _id: '$promoCode',
          conversions: { $addToSet: '$user' },
          revenue: { $sum: '$amount' },
          discountGiven: { $sum: '$promoDiscount' },
          commission: { $sum: '$promoCommission' },
        },
      },
      {
        $project: {
          conversions: { $size: '$conversions' },
          revenue: 1,
          discountGiven: 1,
          commission: 1,
        },
      },
    ]),
  ]);

  const byId = new Map();
  const blank = () => ({ signups: 0, conversions: 0, revenue: 0, discountGiven: 0, commission: 0 });

  for (const row of signupRows) {
    byId.set(String(row._id), { ...blank(), signups: row.signups });
  }
  for (const row of revenueRows) {
    const key = String(row._id);
    byId.set(key, {
      ...(byId.get(key) || blank()),
      conversions: row.conversions,
      revenue: row.revenue,
      discountGiven: row.discountGiven,
      commission: row.commission,
    });
  }

  return { get: (id) => byId.get(String(id)) || blank() };
};

const presentPromoCode = (promo, stats) => ({
  id: promo._id,
  code: promo.code,
  influencerName: promo.influencerName,
  influencerEmail: promo.influencerEmail,
  influencerPhone: promo.influencerPhone,
  notes: promo.notes,
  discountType: promo.discountType,
  discountValue: promo.discountValue,
  maxDiscountAmount: promo.maxDiscountAmount,
  commissionType: promo.commissionType,
  commissionValue: promo.commissionValue,
  usageLimit: promo.usageLimit,
  usageCount: promo.usageCount,
  expiresAt: promo.expiresAt,
  isActive: promo.isActive,
  createdAt: promo.createdAt,
  // Derived server-side so the admin table and any future export agree on
  // what "expired" means without each re-implementing the comparison.
  isExpired: !!(promo.expiresAt && promo.expiresAt.getTime() <= Date.now()),
  isExhausted: promo.usageLimit > 0 && promo.usageCount >= promo.usageLimit,
  stats: stats || { signups: 0, conversions: 0, revenue: 0, discountGiven: 0, commission: 0 },
});

const listPromoCodes = async (query) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  if (query.status === 'active') filter.isActive = true;
  if (query.status === 'inactive') filter.isActive = false;

  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search.trim()), 'i');
    filter.$or = [{ code: rx }, { influencerName: rx }, { influencerEmail: rx }];
  }

  const [promos, total] = await Promise.all([
    PromoCode.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    PromoCode.countDocuments(filter),
  ]);

  const stats = await statsByPromo(promos.map((p) => p._id));

  return {
    promoCodes: promos.map((p) => presentPromoCode(p, stats.get(p._id))),
    page,
    limit,
    total,
  };
};

// Program-wide totals for the page's stat row. Deliberately counts every
// promo-attributed signup/payment rather than only the codes on the current
// page — this is the whole program's health, not the current filter's.
const getOverallStats = async () => {
  const [influencers, activeInfluencers, signups, moneyRows] = await Promise.all([
    PromoCode.countDocuments({}),
    PromoCode.countDocuments({ isActive: true }),
    User.countDocuments({ promoCode: { $ne: null } }),
    Payment.aggregate([
      { $match: { promoCode: { $ne: null }, status: 'paid' } },
      {
        $group: {
          _id: null,
          conversions: { $addToSet: '$user' },
          revenue: { $sum: '$amount' },
          discountGiven: { $sum: '$promoDiscount' },
          commission: { $sum: '$promoCommission' },
        },
      },
      {
        $project: {
          conversions: { $size: '$conversions' },
          revenue: 1,
          discountGiven: 1,
          commission: 1,
        },
      },
    ]),
  ]);

  const money = moneyRows[0] || { conversions: 0, revenue: 0, discountGiven: 0, commission: 0 };

  return {
    influencers,
    activeInfluencers,
    signups,
    conversions: money.conversions,
    revenue: money.revenue,
    discountGiven: money.discountGiven,
    commission: money.commission,
  };
};

// Per-influencer drill-down: who signed up, and did they convert. Answers the
// "show me the users onboarded on this code" ask directly.
const getPromoCodeDetail = async (id, query = {}) => {
  const promo = await PromoCode.findById(id);
  if (!promo) throw new AppError(AUTH_MESSAGES.PROMO_CODE_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');

  const { page, limit, skip } = parsePagination(query);

  const [users, total, stats] = await Promise.all([
    User.find({ promoCode: promo._id })
      .select('name email avatar createdAt subscriptionTier subscriptionStatus')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments({ promoCode: promo._id }),
    statsByPromo([promo._id]),
  ]);

  // One grouped lookup for the whole page instead of a per-row query.
  const payments = await Payment.aggregate([
    { $match: { promoCode: promo._id, status: 'paid', user: { $in: users.map((u) => u._id) } } },
    { $group: { _id: '$user', paid: { $sum: '$amount' }, discount: { $sum: '$promoDiscount' }, commission: { $sum: '$promoCommission' } } },
  ]);
  const byUser = new Map(payments.map((p) => [String(p._id), p]));

  return {
    promoCode: presentPromoCode(promo, stats.get(promo._id)),
    users: users.map((u) => {
      const money = byUser.get(String(u._id));
      return {
        id: u._id,
        name: u.name,
        email: u.email,
        avatar: u.avatar,
        joinedAt: u.createdAt,
        subscriptionTier: u.subscriptionTier,
        subscriptionStatus: u.subscriptionStatus,
        converted: !!money,
        revenue: money?.paid || 0,
        discount: money?.discount || 0,
        commission: money?.commission || 0,
      };
    }),
    page,
    limit,
    total,
  };
};

// ── Admin: CRUD ───────────────────────────────────────────────────────────────

const DUPLICATE_MESSAGE = {
  code: AUTH_MESSAGES.PROMO_CODE_EXISTS,
  influencerEmail: AUTH_MESSAGES.INFLUENCER_EMAIL_EXISTS,
};

// Mongo's duplicate-key errors are the only reliable uniqueness signal under
// concurrency, so both unique fields are translated here rather than
// pre-checked with a findOne that a racing request can invalidate.
const rethrowDuplicate = (err) => {
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0];
    throw new AppError(
      DUPLICATE_MESSAGE[field] || AUTH_MESSAGES.PROMO_CODE_EXISTS,
      HTTP_STATUS.CONFLICT,
      'DUPLICATE'
    );
  }
  throw err;
};

const createPromoCode = async (body, adminId, req) => {
  const code = body.code
    ? String(body.code).trim().toUpperCase()
    : await generateUniquePromoCode(body.influencerName);

  let promo;
  try {
    promo = await PromoCode.create({ ...body, code, createdBy: adminId });
  } catch (err) {
    rethrowDuplicate(err);
  }

  auditService
    .log({ event: AUDIT_EVENTS.PROMO_CODE_CREATED, userId: adminId, ...ctxOf(req), metadata: { promoCodeId: promo._id, code: promo.code } })
    .catch(() => {});

  return presentPromoCode(promo, null);
};

// `code` and `usageCount` are intentionally not updatable. The code is
// already printed in the influencer's published content, and usageCount is
// derived state — both would silently invalidate live attribution.
const UPDATABLE_FIELDS = [
  'influencerName',
  'influencerEmail',
  'influencerPhone',
  'notes',
  'discountType',
  'discountValue',
  'maxDiscountAmount',
  'commissionType',
  'commissionValue',
  'usageLimit',
  'expiresAt',
  'isActive',
];

const updatePromoCode = async (id, body, adminId, req) => {
  const promo = await PromoCode.findById(id);
  if (!promo) throw new AppError(AUTH_MESSAGES.PROMO_CODE_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');

  for (const field of UPDATABLE_FIELDS) {
    if (body[field] !== undefined) promo[field] = body[field];
  }

  try {
    await promo.save();
  } catch (err) {
    rethrowDuplicate(err);
  }

  auditService
    .log({ event: AUDIT_EVENTS.PROMO_CODE_UPDATED, userId: adminId, ...ctxOf(req), metadata: { promoCodeId: promo._id, changes: body } })
    .catch(() => {});

  const stats = await statsByPromo([promo._id]);
  return presentPromoCode(promo, stats.get(promo._id));
};

/**
 * Deactivate, never delete. Past Payments and Users reference this code and
 * their analytics must keep resolving — a hard delete would orphan every
 * conversion the influencer was already owed commission on.
 */
const deactivatePromoCode = async (id, adminId, req) => {
  const promo = await PromoCode.findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true });
  if (!promo) throw new AppError(AUTH_MESSAGES.PROMO_CODE_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');

  auditService
    .log({ event: AUDIT_EVENTS.PROMO_CODE_DEACTIVATED, userId: adminId, ...ctxOf(req), metadata: { promoCodeId: promo._id, code: promo.code } })
    .catch(() => {});

  const stats = await statsByPromo([promo._id]);
  return presentPromoCode(promo, stats.get(promo._id));
};

module.exports = {
  generateUniquePromoCode,
  resolveByCode,
  attribute,
  quoteDiscount,
  recordCommission,
  listPromoCodes,
  getOverallStats,
  getPromoCodeDetail,
  createPromoCode,
  updatePromoCode,
  deactivatePromoCode,
};
