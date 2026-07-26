'use strict';

const crypto = require('crypto');
const Plan = require('../models/plan.model');
const Payment = require('../models/payment.model');
const Subscription = require('../models/subscription.model');
const User = require('../models/user.model');
const razorpayService = require('./razorpay.service');
const paymentService = require('./payment.service');
const auditService = require('./audit.service');
const notificationService = require('./notification.service');
const pricingSettingService = require('./pricingSetting.service');
const { getApplicationUsage } = require('./application.service');
const referralService = require('./referral.service');
const walletService = require('./wallet.service');
const AppError = require('../utils/AppError');
const { config } = require('../config');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');
const { AUDIT_EVENTS } = require('../constants/audit');
const { CURRENCY_BY_REGION, resolveRegion } = require('../utils/pricingRegion.util');
const { buildRegex } = require('../utils/searchUtil');

// An open ('created') order older than this is treated as abandoned and released,
// so a user who bailed out of an earlier checkout isn't locked out forever.
const PENDING_TTL_MS = 15 * 60 * 1000;

// A user may renew (same tier) only once their plan is within this window of expiry.
// Renewing extends the period instead of discarding the remaining days. Kept in sync
// with RENEW_WINDOW_DAYS on the frontend (subscriptionDisplay.js).
const RENEWAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const ctxOf = (req) => ({
  ipAddress: req?.ip || null,
  userAgent: req?.get?.('user-agent') || null,
});

const audit = (event, userId, req, metadata = {}) =>
  auditService.log({ event, userId, ...ctxOf(req), metadata }).catch(() => {});

// ── Public plan catalogue ─────────────────────────────────────────────────────

const toClientPlan = (p, region) => {
  const pricing = p.pricing[region];
  return {
    id: p.code,
    tier: p.tier,
    billingCycle: p.billingCycle,
    name: p.name,
    subtitle: p.subtitle,
    amount: pricing.amount, // smallest currency unit (paise for INR, cents for USD)
    launchAmount: pricing.launchAmount,
    currency: CURRENCY_BY_REGION[region],
    intervalDays: p.intervalDays,
    features: p.features,
    jobApplicationLimit: p.jobApplicationLimit,
  };
};

// Max "yearly vs monthly x12" savings across active tiers, for the region's own
// pricing — matches the "Save up to X%" marketing framing. Returns null if there
// isn't at least one tier with both cycles active (nothing sensible to show).
const computeMaxYearlySavingsPercent = (plans, region) => {
  const byTier = {};
  for (const p of plans) {
    byTier[p.tier] = byTier[p.tier] || {};
    byTier[p.tier][p.billingCycle] = p.pricing[region].amount;
  }

  let max = null;
  for (const cycles of Object.values(byTier)) {
    if (cycles.monthly == null || cycles.yearly == null || cycles.monthly <= 0) continue;
    const savings = 1 - cycles.yearly / (cycles.monthly * 12);
    const percent = Math.round(savings * 100);
    if (percent > 0 && (max == null || percent > max)) max = percent;
  }
  return max;
};

const getActivePlans = async (user) => {
  const region = resolveRegion(user);
  const plans = await Plan.find({ isActive: true }).sort({ displayOrder: 1 }).lean();

  const grouped = { monthly: [], yearly: [] };
  for (const p of plans) {
    (grouped[p.billingCycle] || (grouped[p.billingCycle] = [])).push(toClientPlan(p, region));
  }

  const override = await pricingSettingService.getOverride();
  const yearlyDiscountPercent = override ?? computeMaxYearlySavingsPercent(plans, region);

  return { ...grouped, yearlyDiscountPercent };
};

// First subscription to this tier gets the launch price (if the plan defines one).
const computeAmount = async (plan, userId, region) => {
  const pricing = plan.pricing[region];
  if (pricing.launchAmount != null) {
    const priorPaid = await Payment.exists({ user: userId, tier: plan.tier, status: 'paid' });
    if (!priorPaid) return pricing.launchAmount;
  }
  return pricing.amount;
};

// ── Create order (with the anti-double-charge guard) ──────────────────────────

const createOrder = async ({ user, tier, billingCycle, applyWalletCredit = true }, req) => {
  const plan = await Plan.findOne({ tier, billingCycle, isActive: true });
  if (!plan) {
    throw new AppError(AUTH_MESSAGES.PLAN_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'PLAN_NOT_FOUND');
  }
  const region = resolveRegion(user);
  const currency = CURRENCY_BY_REGION[region];

  // 1) Release abandoned open orders so the lock isn't held forever.
  await Payment.updateMany(
    { user: user._id, status: 'created', createdAt: { $lt: new Date(Date.now() - PENDING_TTL_MS) } },
    { $set: { status: 'failed' } }
  );

  // 2) Handle any in-progress ('created') order. The critical distinction:
  //      • the user actually PAID but confirmation never reached us  → activate it
  //        and BLOCK a second charge ("don't get scammed").
  //      • the user simply CANCELLED / abandoned the checkout          → release it
  //        so they're free to pick a different plan (no false lock-out).
  //    Only Razorpay knows which happened, so we ask it directly.
  const openPayment = await Payment.findOne({ user: user._id, status: 'created' });
  if (openPayment) {
    const { paid } = await paymentService.reconcilePendingOrder(openPayment, req);
    if (paid) {
      // A real payment went through — we've now activated it. Refuse a 2nd charge.
      throw new AppError(
        AUTH_MESSAGES.PAYMENT_ALREADY_MADE,
        HTTP_STATUS.CONFLICT,
        'PAYMENT_ALREADY_MADE'
      );
    }
    // Not paid → the earlier checkout was abandoned.
    if (openPayment.tier === tier && openPayment.billingCycle === billingCycle) {
      // Same plan → hand back the SAME order (Razorpay refuses to pay it twice).
      return orderResponse(openPayment, plan, true);
    }
    // Different plan → release the abandoned order so a fresh one can be created.
    await Payment.updateOne(
      { _id: openPayment._id, status: 'created' },
      { $set: { status: 'cancelled' } }
    );
  }

  // 3) Block buying while an active subscription exists — EXCEPT a genuine renewal:
  //    same tier, and within the renewal window of expiry. A renewal extends the
  //    plan (see activate) instead of opening a redundant second subscription.
  if (user.subscriptionExpiresAt && user.subscriptionExpiresAt > new Date()) {
    const msLeft = user.subscriptionExpiresAt.getTime() - Date.now();
    const isRenewal = msLeft <= RENEWAL_WINDOW_MS && user.subscriptionTier === tier;
    if (!isRenewal) {
      throw new AppError(AUTH_MESSAGES.ALREADY_SUBSCRIBED, HTTP_STATUS.CONFLICT, 'ALREADY_SUBSCRIBED');
    }
  }

  // 4) Server computes the amount — never the client. Region (and therefore
  //    currency) is resolved server-side from the user's own country, also
  //    never trusted from the client.
  const amount = await computeAmount(plan, user._id, region);

  // 4b) Auto-apply wallet credit (referral rewards) unless the client opts out.
  // Debit doesn't happen here — an abandoned order must not consume real
  // credit — it's applied in activate() once the payment is confirmed paid.
  // MIN_CHARGE keeps Razorpay's own ₹1 minimum-order-amount requirement intact.
  const MIN_CHARGE = 100;
  const walletApplied = applyWalletCredit ? Math.min(user.walletBalance || 0, Math.max(amount - MIN_CHARGE, 0)) : 0;
  const chargeable = amount - walletApplied;

  const receipt = `rcpt_${crypto.randomBytes(10).toString('hex')}`;

  const order = await razorpayService.createOrder({
    amount: chargeable,
    currency,
    receipt,
    notes: { userId: String(user._id), tier, billingCycle },
  });

  // 5) Persist the Payment. The partial-unique index guarantees only one open
  //    order per user — a racing request hits E11000 and we reuse the winner.
  // `amount` stores the actually-chargeable value (post-credit) so the
  // existing webhook amount-match defense and revenue analytics are untouched;
  // amountBeforeCredit/walletApplied record the discount itself.
  let payment;
  try {
    payment = await Payment.create({
      user: user._id,
      type: 'subscription',
      plan: plan._id,
      amount: chargeable,
      amountBeforeCredit: walletApplied > 0 ? amount : 0,
      walletApplied,
      currency,
      tier,
      billingCycle,
      status: 'created',
      gatewayOrderId: order.id,
      receipt,
      metadata: { order },
    });
  } catch (err) {
    if (err && err.code === 11000) {
      const existing = await Payment.findOne({ user: user._id, status: 'created' });
      if (existing) return orderResponse(existing, plan, true);
    }
    throw err;
  }

  audit(AUDIT_EVENTS.PAYMENT_INITIATED, user._id, req, { orderId: order.id, amount: chargeable, walletApplied, tier, billingCycle });
  return orderResponse(payment, plan, false);
};

const orderResponse = (payment, plan, reused) => ({
  orderId: payment.gatewayOrderId,
  amount: payment.amount,
  currency: payment.currency,
  keyId: config.razorpay.keyId, // public key only
  planId: plan.code,
  planName: plan.name,
  tier: payment.tier,
  billingCycle: payment.billingCycle,
  walletApplied: payment.walletApplied || 0,
  reused,
});

// ── Idempotent activation (shared by /verify and the webhook) ─────────────────

const activate = async (payment, { gatewayPaymentId = null, signature = null } = {}, req) => {
  // Atomic guard: only the FIRST caller transitions the order to 'paid'. Concurrent
  // verify + webhook are safe — the loser gets null and returns the existing sub.
  // We match created OR a locally-released ('cancelled'/'failed') order too: if a
  // genuinely-paid order was optimistically released (e.g. a plan-switch race), a
  // real captured-payment signal must still activate it exactly once.
  const paid = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $in: ['created', 'cancelled', 'failed'] } },
    { $set: { status: 'paid', gatewayPaymentId, gatewaySignature: signature } },
    { new: true }
  );

  if (!paid) {
    // Already processed → return the existing subscription (true idempotency).
    const existing = await Subscription.findOne({ payment: payment._id });
    return existing;
  }

  const plan = await Plan.findById(paid.plan);
  const now = new Date();

  // Renewal-aware period: if the user still has an unexpired active subscription,
  // stack the new interval on top of the remaining time instead of throwing days
  // away; otherwise start from now.
  const existingActive = await Subscription.findOne({ user: paid.user, status: 'active' })
    .sort({ currentPeriodEnd: -1 });
  const base = existingActive && existingActive.currentPeriodEnd > now ? existingActive.currentPeriodEnd : now;
  const periodEnd = new Date(base.getTime() + (plan?.intervalDays || 30) * 24 * 60 * 60 * 1000);

  // Supersede the prior active subscription (renewal replaces it with the extended one).
  await Subscription.updateMany(
    { user: paid.user, status: 'active' },
    { $set: { status: 'cancelled' } }
  );

  const subscription = await Subscription.create({
    user: paid.user,
    plan: paid.plan,
    tier: paid.tier,
    billingCycle: paid.billingCycle,
    status: 'active',
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    payment: paid._id,
  });

  paid.subscription = subscription._id;
  await paid.save();

  // Update the cached entitlement on the user for fast gating.
  await User.findByIdAndUpdate(paid.user, {
    $set: {
      subscriptionTier: paid.tier,
      subscriptionStatus: 'active',
      subscriptionExpiresAt: periodEnd,
    },
  });

  audit(AUDIT_EVENTS.PAYMENT_SUCCEEDED, paid.user, req, { orderId: paid.gatewayOrderId, amount: paid.amount });
  audit(AUDIT_EVENTS.SUBSCRIPTION_CREATED, paid.user, req, { tier: paid.tier, periodEnd });

  // Debit whatever wallet credit was applied to THIS order — deliberately
  // done here (on confirmed payment), not at order creation, so an abandoned
  // order never consumes real credit.
  if (paid.walletApplied > 0) {
    walletService
      .redeem({ user: paid.user, amount: paid.walletApplied, type: 'redemption', payment: paid._id, description: 'Applied to subscription purchase' })
      .then(() => audit(AUDIT_EVENTS.WALLET_REDEEMED, paid.user, req, { amount: paid.walletApplied, paymentId: paid._id }))
      .catch((err) => console.error('subscription.service.activate: wallet redemption failed (non-fatal):', err.message));
  }

  // Reward the referrer if this is the referee's first-ever paid subscription.
  // Never allowed to break activation — same fire-and-forget philosophy as
  // the admin notification below.
  referralService.creditRewardForFirstPayment(paid, req).catch((err) => {
    console.error('subscription.service.activate: referral reward failed (non-fatal):', err.message);
  });

  User.findById(paid.user)
    .select('name')
    .then((purchaser) => {
      if (!purchaser) return;
      notificationService.notifyAdmins({
        type: notificationService.NOTIFICATION_TYPES.SUBSCRIPTION_PURCHASED,
        title: 'New Subscription',
        body: `${purchaser.name} purchased the ${plan?.name ?? paid.tier} plan.`,
        data: { userId: paid.user, tier: paid.tier },
      });
    })
    .catch(() => {});

  return subscription;
};

// ── Client verify path ────────────────────────────────────────────────────────

const verifyPayment = async ({ user, orderId, paymentId, signature }, req) => {
  const ok = razorpayService.verifyPaymentSignature({ orderId, paymentId, signature });
  if (!ok) {
    throw new AppError(AUTH_MESSAGES.PAYMENT_VERIFICATION_FAILED, HTTP_STATUS.BAD_REQUEST, 'INVALID_SIGNATURE');
  }

  const payment = await Payment.findOne({ gatewayOrderId: orderId });
  if (!payment) {
    throw new AppError(AUTH_MESSAGES.PAYMENT_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'PAYMENT_NOT_FOUND');
  }
  // Ownership — a user can only confirm their OWN order.
  if (String(payment.user) !== String(user._id)) {
    throw new AppError(AUTH_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN, 'FORBIDDEN');
  }

  await activate(payment, { gatewayPaymentId: paymentId, signature }, req);
  return getMySubscription(user);
};

// ── Current subscription (with lazy expiry) ───────────────────────────────────

const getMySubscription = async (user) => {
  const userId = user._id;
  const region = resolveRegion(user);
  const sub = await Subscription.findOne({ user: userId, status: 'active' })
    .sort({ currentPeriodEnd: -1 })
    .populate('plan');

  if (!sub) return { active: false, tier: null, status: 'none', currentPeriodEnd: null };

  // Lazy expiry — flip status + clear the user cache the moment we notice it lapsed.
  if (sub.currentPeriodEnd <= new Date()) {
    sub.status = 'expired';
    await sub.save();
    await User.findByIdAndUpdate(userId, {
      $set: { subscriptionStatus: 'expired', subscriptionExpiresAt: sub.currentPeriodEnd },
    });
    audit(AUDIT_EVENTS.SUBSCRIPTION_EXPIRED, userId, null, { tier: sub.tier });
    return { active: false, tier: null, status: 'expired', currentPeriodEnd: sub.currentPeriodEnd };
  }

  // Surfaces the monthly application-usage counter on the same status fetch
  // the app already polls everywhere (SubscriptionContext) — no separate
  // endpoint needed for the upsell usage pill.
  const usage = await getApplicationUsage(user);

  return {
    active: true,
    tier: sub.tier,
    status: sub.status,
    billingCycle: sub.billingCycle,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    plan: sub.plan ? toClientPlan(sub.plan, region) : null,
    applicationsUsed: usage.applicationsUsed,
    applicationLimit: usage.applicationLimit,
    applicationsRemaining: usage.applicationsRemaining,
  };
};

// ── Admin analytics (stats row / revenue-by-tier donut / recent subscribers) ──

const getAdminAnalytics = async () => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const renewalWindowEnd = new Date(now.getTime() + RENEWAL_WINDOW_MS);

  const [revenueAgg, activeSubscribers, renewalDue, expiredSubscriptions, tierAgg, recentSubs] = await Promise.all([
    Payment.aggregate([
      { $match: { status: 'paid', currency: 'INR', createdAt: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Subscription.countDocuments({ status: 'active', currentPeriodEnd: { $gt: now } }),
    Subscription.countDocuments({ status: 'active', currentPeriodEnd: { $gt: now, $lte: renewalWindowEnd } }),
    Subscription.countDocuments({ status: 'expired' }),
    Subscription.aggregate([
      { $match: { status: 'active', currentPeriodEnd: { $gt: now } } },
      { $group: { _id: '$tier', count: { $sum: 1 } } },
    ]),
    Subscription.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('user', 'name')
      .populate('plan', 'name'),
  ]);

  const tierCounts = {};
  for (const row of tierAgg) tierCounts[row._id] = row.count;

  const tierDistribution = Plan.PLAN_TIERS.map((tier) => {
    const count = tierCounts[tier] || 0;
    const percent = activeSubscribers > 0 ? Math.round((count / activeSubscribers) * 100) : 0;
    return { tier, count, percent };
  });

  return {
    monthlyRevenueInr: revenueAgg[0]?.total || 0,
    activeSubscribers,
    renewalDue,
    expiredSubscriptions,
    tierDistribution,
    recentSubscribers: recentSubs.map((s) => ({
      id: s._id,
      candidate: s.user?.name || 'Unknown',
      plan: s.plan?.name || s.tier,
      tier: s.tier,
      startDate: s.currentPeriodStart,
      expiryDate: s.currentPeriodEnd,
    })),
  };
};

// ── Admin payments list (Payments page) ───────────────────────────────────────

const parsePagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
};

// Turns "paid" into "paid" and "paid,failed" into { $in: [...] } — same
// multi-select-tab support used elsewhere (job.service.js, application.service.js).
const parseCsvFilter = (value) => {
  const tokens = String(value).split(',').map((v) => v.trim()).filter(Boolean);
  return tokens.length > 1 ? { $in: tokens } : tokens[0];
};

const presentAdminPayment = (payment) => ({
  id: payment._id,
  user: payment.user && typeof payment.user === 'object'
    ? { id: payment.user._id, name: payment.user.name, email: payment.user.email, avatar: payment.user.avatar }
    : null,
  // Prefer the plan's current display name; fall back to the payment's own
  // tier/billingCycle snapshot if the plan was since deleted/renamed.
  planName: payment.plan && typeof payment.plan === 'object' ? payment.plan.name : null,
  tier: payment.tier,
  billingCycle: payment.billingCycle,
  amount: payment.amount,
  amountBeforeCredit: payment.amountBeforeCredit,
  walletApplied: payment.walletApplied,
  currency: payment.currency,
  status: payment.status,
  gatewayOrderId: payment.gatewayOrderId,
  gatewayPaymentId: payment.gatewayPaymentId,
  createdAt: payment.createdAt,
});

const listAdminPayments = async (query) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  if (query.status) filter.status = parseCsvFilter(query.status);
  if (query.tier) filter.tier = parseCsvFilter(query.tier);

  if (query.search) {
    const rx = buildRegex(query.search);
    const matchingUsers = await User.find({ $or: [{ name: rx }, { email: rx }, { phone: rx }] }).select('_id').lean();
    filter.$or = [
      { user: { $in: matchingUsers.map((u) => u._id) } },
      { gatewayOrderId: rx },
      { receipt: rx },
    ];
  }

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name email avatar')
      .populate('plan', 'name')
      .lean(),
    Payment.countDocuments(filter),
  ]);

  return { payments: payments.map(presentAdminPayment), page, limit, total };
};

// Stats row for the admin Payments page. Revenue is INR-only (same
// convention as getAdminAnalytics above) — summing mixed currencies would be
// meaningless without a conversion rate.
const getPaymentStats = async () => {
  const [revenueAgg, paidCount, failedCount, refundedCount] = await Promise.all([
    Payment.aggregate([
      { $match: { status: 'paid', currency: 'INR' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Payment.countDocuments({ status: 'paid' }),
    Payment.countDocuments({ status: 'failed' }),
    Payment.countDocuments({ status: 'refunded' }),
  ]);

  return {
    totalRevenueInr: revenueAgg[0]?.total || 0,
    paidCount,
    failedCount,
    refundedCount,
  };
};

// ── Admin subscriptions list ("View All" on the Subscriptions page) ──────────

const presentAdminSubscription = (sub) => ({
  id: sub._id,
  candidate: sub.user && typeof sub.user === 'object' ? sub.user.name : null,
  plan: sub.plan && typeof sub.plan === 'object' ? sub.plan.name : null,
  tier: sub.tier,
  billingCycle: sub.billingCycle,
  status: sub.status,
  startDate: sub.currentPeriodStart,
  expiryDate: sub.currentPeriodEnd,
});

const listAdminSubscriptions = async (query) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  if (query.status) filter.status = parseCsvFilter(query.status);
  if (query.tier) filter.tier = parseCsvFilter(query.tier);

  if (query.search) {
    const rx = buildRegex(query.search);
    const matchingUsers = await User.find({ $or: [{ name: rx }, { email: rx }, { phone: rx }] }).select('_id').lean();
    filter.user = { $in: matchingUsers.map((u) => u._id) };
  }

  const [subscriptions, total] = await Promise.all([
    Subscription.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name email')
      .populate('plan', 'name')
      .lean(),
    Subscription.countDocuments(filter),
  ]);

  return { subscriptions: subscriptions.map(presentAdminSubscription), page, limit, total };
};

module.exports = {
  getActivePlans,
  createOrder,
  activate, // exported for payment.service.js's type-dispatch (reconcile + webhook)
  verifyPayment,
  getMySubscription,
  getAdminAnalytics,
  listAdminPayments,
  getPaymentStats,
  listAdminSubscriptions,
};
