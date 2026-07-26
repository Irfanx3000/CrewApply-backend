'use strict';

/**
 * Proves the referral + wallet-credit system end-to-end:
 *  1) A referee attributed to a referrer's code, driven through their FIRST
 *     paid subscription via the real webhook path, rewards the referrer's
 *     wallet by exactly ReferralSetting.rewardAmount, and flips the Referral
 *     to 'rewarded'.
 *  2) A renewal (second paid payment) for the same referee does NOT re-reward.
 *  3) The monthly cap suppresses payout (status -> 'qualified', no crash) once hit.
 *  4) Wallet balance is correctly auto-applied as a discount at checkout and
 *     debited only once the order is actually paid.
 *
 * Run: node src/scripts/testReferral.js
 */

require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Plan = require('../models/plan.model');
const Payment = require('../models/payment.model');
const Subscription = require('../models/subscription.model');
const Referral = require('../models/referral.model');
const WalletTransaction = require('../models/walletTransaction.model');
const ReferralSetting = require('../models/referralSetting.model');
const subscriptionService = require('../services/subscription.service');
const paymentService = require('../services/payment.service');
const referralService = require('../services/referral.service');

const fakeReq = { ip: '127.0.0.1', get: () => 'test-script' };
const DAY = 24 * 60 * 60 * 1000;

const payViaWebhook = async (orderId, amount) => {
  const event = {
    event: 'order.paid',
    payload: {
      order: { entity: { id: orderId, amount } },
      payment: { entity: { id: `pay_${crypto.randomBytes(6).toString('hex')}`, order_id: orderId, amount } },
    },
  };
  const raw = Buffer.from(JSON.stringify(event));
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
  await paymentService.handleWebhook({ rawBody: raw, signature }, fakeReq);
};

const freshUser = async (u) => User.findById(u._id);

// activate()'s reward-crediting is deliberately fire-and-forget (must never
// delay the payment-activation response) — poll briefly for its side effects
// to land instead of racing them.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (checkFn, { tries = 15, delayMs = 200 } = {}) => {
  for (let i = 0; i < tries; i++) {
    if (await checkFn()) return true;
    await sleep(delayMs);
  }
  return false;
};

const results = [];
const check = (label, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? '✅' : '❌'} ${label}${detail !== undefined ? ' — ' + detail : ''}`);
};

const resetUser = async (email, phone, name) => {
  let user = await User.findOne({ email });
  if (user) {
    await Payment.deleteMany({ user: user._id });
    await Subscription.deleteMany({ user: user._id });
    await Referral.deleteMany({ $or: [{ referrer: user._id }, { referee: user._id }] });
    await WalletTransaction.deleteMany({ user: user._id });
    await User.deleteOne({ _id: user._id });
  }
  user = await User.create({
    name, email, password: 'Passw0rd!23', phone, phoneVerified: true, isActive: true,
    referralCode: await referralService.generateUniqueReferralCode(),
  });
  return user;
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ DB connected\n');

  // Baseline settings for a deterministic test run.
  const setting = await ReferralSetting.findOneAndUpdate(
    {},
    { $set: { rewardAmount: 5000, maxRewardsPerMonth: 0, enabled: true } },
    { new: true, upsert: true }
  );

  let referrer = await resetUser('referral.referrer@example.com', '+919000000201', 'Referral Referrer');
  let referee = await resetUser('referral.referee@example.com', '+919000000202', 'Referral Referee');
  console.log(`✓ reset fixtures — referrer code: ${referrer.referralCode}\n`);

  // ── 1) Attribution ───────────────────────────────────────────────────────
  await User.updateOne({ _id: referee._id }, { $set: { referredBy: referrer._id } });
  referee = await freshUser(referee);
  const referral = await referralService.attribute(referee, fakeReq);
  check('attribution: Referral row created with status=pending', referral && referral.status === 'pending');

  // ── 2) First payment rewards the referrer ───────────────────────────────
  const plan = await Plan.findOne({ tier: 'start', billingCycle: 'monthly' });
  if (!plan) throw new Error('start/monthly Plan not seeded — run seedPlans.js first.');

  const order1 = await subscriptionService.createOrder({ user: referee, tier: 'start', billingCycle: 'monthly' }, fakeReq);
  await payViaWebhook(order1.orderId, order1.amount);
  await waitFor(async () => (await Referral.findById(referral._id)).status !== 'pending');

  const referrerAfterReward = await User.findById(referrer._id);
  const referralAfterReward = await Referral.findById(referral._id);
  const rewardTxn = await WalletTransaction.findOne({ referral: referral._id, type: 'referral_reward' });

  check('reward: referrer walletBalance increased by rewardAmount', referrerAfterReward.walletBalance === setting.rewardAmount, `balance=${referrerAfterReward.walletBalance}`);
  check('reward: a referral_reward WalletTransaction exists', !!rewardTxn);
  check('reward: Referral.status is rewarded', referralAfterReward.status === 'rewarded', referralAfterReward.status);

  // ── 3) Renewal does NOT re-reward ───────────────────────────────────────
  // Force near-expiry so a same-tier purchase is treated as a renewal, not blocked.
  const sub = await Subscription.findOne({ user: referee._id, status: 'active' });
  await Subscription.updateOne({ _id: sub._id }, { $set: { currentPeriodEnd: new Date(Date.now() + 3 * DAY) } });
  await User.updateOne({ _id: referee._id }, { $set: { subscriptionExpiresAt: new Date(Date.now() + 3 * DAY) } });
  const refereeForRenewal = await freshUser(referee);

  const order2 = await subscriptionService.createOrder({ user: refereeForRenewal, tier: 'start', billingCycle: 'monthly' }, fakeReq);
  await payViaWebhook(order2.orderId, order2.amount);
  await sleep(500); // give any (incorrect) re-reward attempt time to land before asserting its absence

  const referrerAfterRenewal = await User.findById(referrer._id);
  const rewardTxnCount = await WalletTransaction.countDocuments({ referral: referral._id, type: 'referral_reward' });
  check('renewal: wallet balance unchanged after a second payment', referrerAfterRenewal.walletBalance === setting.rewardAmount, `balance=${referrerAfterRenewal.walletBalance}`);
  check('renewal: still exactly one referral_reward transaction', rewardTxnCount === 1, rewardTxnCount);

  // ── 4) Monthly cap suppresses payout ─────────────────────────────────────
  // Cap is per-referrer — test it against the SAME referrer who already has
  // exactly 1 reward this month from step 2, not a fresh referrer (who'd
  // trivially be under any cap &gt;= 1).
  let referee3 = await resetUser('referral.referee3@example.com', '+919000000205', 'Referral Referee 3');
  await User.updateOne({ _id: referee3._id }, { $set: { referredBy: referrer._id } });
  referee3 = await freshUser(referee3);
  const referral3 = await referralService.attribute(referee3, fakeReq);

  await ReferralSetting.updateOne({}, { $set: { maxRewardsPerMonth: 1 } });
  const balanceBeforeCap = (await User.findById(referrer._id)).walletBalance;
  const orderCapped = await subscriptionService.createOrder({ user: referee3, tier: 'start', billingCycle: 'monthly' }, fakeReq);
  await payViaWebhook(orderCapped.orderId, orderCapped.amount);
  await waitFor(async () => (await Referral.findById(referral3._id)).status !== 'pending');

  const referral3After = await Referral.findById(referral3._id);
  const referrerAfterCap = await User.findById(referrer._id);
  check('cap: Referral status is qualified (not rewarded)', referral3After.status === 'qualified', referral3After.status);
  check('cap: already-at-cap referrer received no additional wallet credit', referrerAfterCap.walletBalance === balanceBeforeCap, referrerAfterCap.walletBalance);
  await ReferralSetting.updateOne({}, { $set: { maxRewardsPerMonth: 0 } }); // restore for the next test

  // ── 5) Wallet redemption at checkout ─────────────────────────────────────
  // referrer now has a wallet balance from step 2 — spend it on their own purchase.
  const referrerForCheckout = await freshUser(referrer);
  const balanceBefore = referrerForCheckout.walletBalance;
  const orderRedeem = await subscriptionService.createOrder({ user: referrerForCheckout, tier: 'premium', billingCycle: 'monthly', applyWalletCredit: true }, fakeReq);
  check('redemption: order reflects walletApplied > 0', orderRedeem.walletApplied > 0, orderRedeem.walletApplied);

  const paymentBeforeActivate = await Payment.findOne({ gatewayOrderId: orderRedeem.orderId });
  check('redemption: Payment.amount is reduced by walletApplied', paymentBeforeActivate.amount === paymentBeforeActivate.amountBeforeCredit - paymentBeforeActivate.walletApplied);

  await payViaWebhook(orderRedeem.orderId, orderRedeem.amount);
  await waitFor(async () => !!(await WalletTransaction.findOne({ payment: paymentBeforeActivate._id, type: 'redemption' })));

  const referrerAfterRedeem = await User.findById(referrer._id);
  const redemptionTxn = await WalletTransaction.findOne({ payment: paymentBeforeActivate._id, type: 'redemption' });
  check('redemption: a negative redemption WalletTransaction exists', !!redemptionTxn && redemptionTxn.amount < 0);
  check('redemption: wallet balance decreased by walletApplied', referrerAfterRedeem.walletBalance === balanceBefore - orderRedeem.walletApplied, `before=${balanceBefore} after=${referrerAfterRedeem.walletBalance}`);

  const pass = results.every(Boolean);
  console.log('\n' + (pass ? '✅ PASS — referral + wallet system works end-to-end' : '❌ FAIL — see above'));

  await mongoose.disconnect();
  process.exit(pass ? 0 : 1);
})().catch(async (e) => {
  console.error('ERROR:', e);
  await mongoose.disconnect();
  process.exit(1);
});
