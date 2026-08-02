'use strict';

const crypto = require('crypto');
const Plan = require('../models/plan.model');
const { TIER_RANK } = Plan;
const Payment = require('../models/payment.model');
const Subscription = require('../models/subscription.model');
const User = require('../models/user.model');
const razorpayService = require('./razorpay.service');
const paymentService = require('./payment.service');
const auditService = require('./audit.service');
const notificationService = require('./notification.service');
const emailService = require('./email.service');
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

// ── Plan switching: proration, period math, scenario classification ──────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Cash-only proration — deliberately computed from the old payment's actual
// `amount` (real money received), never `amountBeforeCredit`/`walletApplied`.
// Prorating the wallet-funded portion of a purchase and letting the excess
// flow back to the wallet would let a user launder wallet credit into MORE
// wallet credit by switching repeatedly. Ratio is capped at 1 — a renewal
// that stacked remaining runway onto an earlier payment means some of the
// current remaining days were actually funded by that earlier payment too;
// capping at the latest payment's own amount is the safe, conservative
// choice rather than reconstructing a full multi-payment ledger for this
// rare case.
const computeProratedCredit = async (existingActive, oldPlanIntervalDays) => {
  if (!existingActive?.payment) return 0;
  const oldPayment = await Payment.findById(existingActive.payment).select('amount status').lean();
  if (!oldPayment || oldPayment.status !== 'paid' || !(oldPayment.amount > 0)) return 0;

  const daysRemaining = Math.max(0, existingActive.currentPeriodEnd.getTime() - Date.now()) / MS_PER_DAY;
  const ratio = Math.min(1, daysRemaining / (oldPlanIntervalDays || 30));
  return Math.round(oldPayment.amount * ratio);
};

// Shared by the order-creation summary preview AND activate()'s real
// activation, so what the user is shown before paying always matches what
// happens after. A switch always starts fresh from today (the old plan's
// remaining value was already captured as proration credit in the price,
// so stacking it too would double-count it) — only a genuine same-tier
// renewal stacks onto the remaining time.
const computeNewPeriod = (existingActive, plan, isSwitch, now = new Date()) => {
  const base = (!isSwitch && existingActive && existingActive.currentPeriodEnd > now) ? existingActive.currentPeriodEnd : now;
  return { start: now, end: new Date(base.getTime() + (plan?.intervalDays || 30) * MS_PER_DAY) };
};

// Drives the Plan Summary screen's dynamic header/color/copy — computed once
// server-side so the client never re-derives billing classification itself.
const classifyScenario = (hasActiveSub, isSameSelection, existingActive, plan, oldPlanIntervalDays) => {
  if (!hasActiveSub) return 'purchase';
  if (isSameSelection) return 'renewal';
  if (existingActive.tier !== plan.tier) {
    return TIER_RANK[plan.tier] > TIER_RANK[existingActive.tier] ? 'upgrade' : 'downgrade';
  }
  // Same tier, different billingCycle (e.g. monthly -> yearly) — tier rank
  // ties, so classify by which cycle represents more total commitment.
  return plan.intervalDays > (oldPlanIntervalDays || 0) ? 'upgrade' : 'downgrade';
};

// Data-driven price breakdown — the mobile PaymentBreakdownRow component
// renders this array directly, only ever showing lines that actually apply.
const buildPriceBreakdown = (payment) => {
  const rows = [{ label: 'Plan Price', amount: payment.amountBeforeCredit, kind: 'charge' }];
  if (payment.proratedCredit > 0) rows.push({ label: 'Unused Subscription Credit', amount: -payment.proratedCredit, kind: 'credit' });
  if (payment.walletApplied > 0) rows.push({ label: 'Wallet Balance Used', amount: -payment.walletApplied, kind: 'credit' });
  rows.push({ label: 'Amount Payable', amount: payment.amount, kind: 'total' });
  return rows;
};

// The "Summary Object" the Plan Summary screen renders directly — built from
// the persisted Payment (source of truth for what will actually be charged/
// credited) plus a couple of fresh, current-moment reads (remaining days,
// projected new period) so a summary revisited later still reflects reality.
const buildSummary = async ({ payment, plan, reused = false, activated = false, subscription = null }) => {
  const summary = {
    orderId: payment.gatewayOrderId,
    payableAmount: payment.amount,
    currency: payment.currency,
    keyId: config.razorpay.keyId, // public key only
    planId: plan.code,
    planName: plan.name,
    tier: payment.tier,
    billingCycle: payment.billingCycle,
    walletApplied: payment.walletApplied || 0,
    proratedCredit: payment.proratedCredit || 0,
    excessProrationCredit: payment.excessProrationCredit || 0,
    scenario: payment.scenario,
    priceBreakdown: buildPriceBreakdown(payment),
    reused,
    activated,
  };

  const oldSub = payment.previousSubscription
    ? await Subscription.findById(payment.previousSubscription).populate('plan')
    : null;

  if (oldSub) {
    summary.currentPlan = {
      tier: oldSub.tier,
      billingCycle: oldSub.billingCycle,
      name: oldSub.plan?.name || oldSub.tier,
      remainingDays: Math.max(0, Math.ceil((oldSub.currentPeriodEnd.getTime() - Date.now()) / MS_PER_DAY)),
      unusedCredit: payment.proratedCredit || 0,
    };
  }

  const { start, end } = computeNewPeriod(oldSub, plan, !!payment.previousSubscription);
  summary.newPeriodStart = start;
  summary.newPeriodEnd = end;

  if (activated && subscription) {
    summary.subscription = {
      tier: subscription.tier,
      billingCycle: subscription.billingCycle,
      currentPeriodEnd: subscription.currentPeriodEnd,
    };
    const freshUser = await User.findById(payment.user).select('walletBalance');
    summary.walletBalanceAfter = freshUser?.walletBalance || 0;
  }

  return summary;
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
      const existingPlan = await Plan.findById(openPayment.plan);
      return buildSummary({ payment: openPayment, plan: existingPlan || plan, reused: true });
    }
    // Different plan → release the abandoned order so a fresh one can be created.
    await Payment.updateOne(
      { _id: openPayment._id, status: 'created' },
      { $set: { status: 'cancelled' } }
    );
  }

  // 3) Classify: block ONLY the literal "buy the identical plan you already
  //    have, too early to renew" case — exactly today's behavior. Any
  //    genuine tier or billingCycle difference while active is now a SWITCH,
  //    not a block, priced with prorated credit (see below).
  const existingActive = await Subscription.findOne({ user: user._id, status: 'active' }).sort({ currentPeriodEnd: -1 });
  const hasActiveSub = !!(existingActive && existingActive.currentPeriodEnd > new Date());
  const isSameSelection = hasActiveSub && existingActive.tier === tier && existingActive.billingCycle === billingCycle;
  let isSwitch = false;

  if (hasActiveSub) {
    if (isSameSelection) {
      const isRenewal = (existingActive.currentPeriodEnd.getTime() - Date.now()) <= RENEWAL_WINDOW_MS;
      if (!isRenewal) {
        throw new AppError(AUTH_MESSAGES.ALREADY_SUBSCRIBED, HTTP_STATUS.CONFLICT, 'ALREADY_SUBSCRIBED');
      }
      // else falls through as today's same-tier renewal path — isSwitch stays false
    } else {
      isSwitch = true;
    }
  }

  let oldPlan = null;
  if (isSwitch) {
    oldPlan = await Plan.findById(existingActive.plan).select('intervalDays').lean();
  }

  // 4) Server computes the amount — never the client. Region (and therefore
  //    currency) is resolved server-side from the user's own country, also
  //    never trusted from the client. Switches price at LIST (never stack a
  //    launch-price discount under proration credit too — that'd be a
  //    double discount and an incentive to tier-hop for cheap "first
  //    purchases").
  const baseAmount = isSwitch ? plan.pricing[region].amount : await computeAmount(plan, user._id, region);
  const proratedCredit = isSwitch ? await computeProratedCredit(existingActive, oldPlan?.intervalDays) : 0;
  const excessProrationCredit = isSwitch ? Math.max(0, proratedCredit - baseAmount) : 0;
  const amountAfterProration = Math.max(0, baseAmount - proratedCredit);

  // 4b) Auto-apply wallet credit (referral rewards) unless the client opts
  // out. Debit doesn't happen here — an abandoned order must not consume
  // real credit — it's applied in activate() once the payment is confirmed
  // paid. Genuinely allowed to reach 0 now (proration + wallet fully
  // covering the cost) — the spec requires skipping Razorpay entirely in
  // that case (see below), not forcing a token charge through it. MIN_CHARGE
  // only matters when SOME real gateway charge remains: if the wallet would
  // leave a sliver below Razorpay's own practical minimum, hold back just
  // enough wallet credit to clear it, rather than attempt a sub-minimum order.
  const MIN_CHARGE = 100;
  let walletApplied = applyWalletCredit ? Math.min(user.walletBalance || 0, amountAfterProration) : 0;
  let chargeable = amountAfterProration - walletApplied;
  if (chargeable > 0 && chargeable < MIN_CHARGE) {
    walletApplied = Math.max(0, walletApplied - (MIN_CHARGE - chargeable));
    chargeable = amountAfterProration - walletApplied;
  }

  const scenario = classifyScenario(hasActiveSub, isSameSelection, existingActive, plan, oldPlan?.intervalDays);
  const receipt = `rcpt_${crypto.randomBytes(10).toString('hex')}`;

  const paymentFields = {
    user: user._id,
    type: 'subscription',
    plan: plan._id,
    amount: chargeable,
    amountBeforeCredit: baseAmount,
    walletApplied,
    previousSubscription: isSwitch ? existingActive._id : null,
    proratedCredit,
    excessProrationCredit,
    scenario,
    currency,
    tier,
    billingCycle,
    receipt,
  };

  // 5) Persist the Payment. The partial-unique index guarantees only one open
  //    order per user — a racing request hits E11000 and we reuse the winner.
  //    `amount` stores the actually-chargeable value (post-credit) so the
  //    existing webhook amount-match defense and revenue analytics are
  //    untouched; amountBeforeCredit/walletApplied/proratedCredit record the
  //    discount itself.
  if (chargeable === 0) {
    // Fully covered by proration credit + wallet — per the product spec,
    // NEVER open Razorpay for a zero-payable order. A synthetic unique
    // gatewayOrderId still satisfies the schema (required + unique) without
    // any gateway involved at all.
    let payment;
    try {
      payment = await Payment.create({
        ...paymentFields,
        status: 'created',
        gatewayOrderId: `free_${crypto.randomBytes(10).toString('hex')}`,
        metadata: {},
      });
    } catch (err) {
      if (err && err.code === 11000) {
        const existing = await Payment.findOne({ user: user._id, status: 'created' });
        if (existing) {
          const existingPlan = await Plan.findById(existing.plan);
          return buildSummary({ payment: existing, plan: existingPlan || plan, reused: true });
        }
      }
      throw err;
    }
    audit(AUDIT_EVENTS.PAYMENT_INITIATED, user._id, req, { orderId: payment.gatewayOrderId, amount: 0, walletApplied, tier, billingCycle });
    const subscription = await activate(payment, {}, req);
    return buildSummary({ payment, plan, reused: false, activated: true, subscription });
  }

  const order = await razorpayService.createOrder({
    amount: chargeable,
    currency,
    receipt,
    notes: { userId: String(user._id), tier, billingCycle },
  });

  let payment;
  try {
    payment = await Payment.create({
      ...paymentFields,
      status: 'created',
      gatewayOrderId: order.id,
      metadata: { order },
    });
  } catch (err) {
    if (err && err.code === 11000) {
      const existing = await Payment.findOne({ user: user._id, status: 'created' });
      if (existing) {
        const existingPlan = await Plan.findById(existing.plan);
        return buildSummary({ payment: existing, plan: existingPlan || plan, reused: true });
      }
    }
    throw err;
  }

  audit(AUDIT_EVENTS.PAYMENT_INITIATED, user._id, req, { orderId: order.id, amount: chargeable, walletApplied, tier, billingCycle });
  return buildSummary({ payment, plan, reused: false });
};

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

  // Renewal-aware period: if the user still has an unexpired active
  // subscription AND this isn't a switch, stack the new interval on top of
  // the remaining time instead of throwing days away. A switch (identified
  // by previousSubscription being set) always starts fresh from today — the
  // old plan's remaining value was already captured as proration credit in
  // the price at order-creation time, so stacking it too would double-count it.
  const isSwitch = !!paid.previousSubscription;
  const existingActive = await Subscription.findOne({ user: paid.user, status: 'active' })
    .sort({ currentPeriodEnd: -1 });
  const { end: periodEnd } = computeNewPeriod(existingActive, plan, isSwitch, now);

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

  // Excess proration credit from a downgrade (the old plan's unused value
  // exceeded the new plan's entire price) — deposited to the wallet rather
  // than refunded as cash, since no partial-refund gateway integration
  // exists here. Same non-blocking, fire-and-forget contract as the debit above.
  if (paid.excessProrationCredit > 0) {
    walletService
      .credit({ user: paid.user, amount: paid.excessProrationCredit, type: 'plan_switch_credit', description: 'Unused credit from switching subscription plans' })
      .catch((err) => console.error('subscription.service.activate: excess proration credit failed (non-fatal):', err.message));
  }

  // Reward the referrer if this is the referee's first-ever paid subscription.
  // Never allowed to break activation — same fire-and-forget philosophy as
  // the admin notification below.
  referralService.creditRewardForFirstPayment(paid, req).catch((err) => {
    console.error('subscription.service.activate: referral reward failed (non-fatal):', err.message);
  });

  User.findById(paid.user)
    .select('name email')
    .then((purchaser) => {
      if (!purchaser) return;
      notificationService.notifyAdmins({
        type: notificationService.NOTIFICATION_TYPES.SUBSCRIPTION_PURCHASED,
        title: 'New Subscription',
        body: `${purchaser.name} purchased the ${plan?.name ?? paid.tier} plan.`,
        data: { userId: paid.user, tier: paid.tier },
      });

      // Fire-and-forget, same non-blocking contract as the wallet/referral
      // side effects above — a failed confirmation email must never undo an
      // already-successful payment/activation.
      if (purchaser.email) {
        emailService
          .sendSubscriptionSuccessEmail({
            to: purchaser.email,
            name: purchaser.name,
            planName: plan?.name ?? paid.tier,
            billingCycle: paid.billingCycle,
            amount: paid.amount,
            currency: paid.currency,
            periodEnd,
          })
          .catch(() => {});
      }
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
