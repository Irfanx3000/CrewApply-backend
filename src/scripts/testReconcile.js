'use strict';

/**
 * Proves the fixed anti-double-charge logic:
 *  1) Create a MONTHLY order (real Razorpay order, unpaid).
 *  2) Switch to YEARLY — previously blocked with PAYMENT_IN_PROGRESS.
 *     Now: reconcile sees the monthly order was NOT paid (user cancelled),
 *     releases it, and creates the yearly order. Should SUCCEED.
 *  3) The old monthly Payment should be 'cancelled', with exactly ONE open order.
 *
 * Run: node src/scripts/testReconcile.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Payment = require('../models/payment.model');
const Subscription = require('../models/subscription.model');
const subscriptionService = require('../services/subscription.service');

const fakeReq = { ip: '127.0.0.1', get: () => 'test-script' };

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ DB connected\n');

  // A dedicated, unsubscribed test user (no active sub, no open orders).
  const email = 'reconcile.test@example.com';
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      name: 'Reconcile Test',
      email,
      password: 'Passw0rd!23',
      phone: '+919000000042',
      phoneVerified: true,
      isActive: true,
    });
    console.log('✓ created test user');
  }
  // Clean slate.
  await Payment.deleteMany({ user: user._id });
  await Subscription.deleteMany({ user: user._id });
  await User.updateOne({ _id: user._id }, {
    $set: { subscriptionTier: null, subscriptionStatus: null, subscriptionExpiresAt: null },
  });
  user = await User.findById(user._id);
  console.log('✓ reset test user (no orders, no subscription)\n');

  // 1) Monthly order
  const monthly = await subscriptionService.createOrder(
    { user, tier: 'premium', billingCycle: 'monthly' }, fakeReq
  );
  console.log('1) MONTHLY order  →', monthly.orderId, `₹${monthly.amount / 100}`, monthly.billingCycle);

  const openAfterMonthly = await Payment.countDocuments({ user: user._id, status: 'created' });
  console.log('   open orders:', openAfterMonthly, '(expect 1)\n');

  // 2) Switch to yearly (the scenario that used to be blocked)
  let yearly, blocked = null;
  try {
    yearly = await subscriptionService.createOrder(
      { user, tier: 'premium', billingCycle: 'yearly' }, fakeReq
    );
  } catch (e) {
    blocked = e.errorCode || e.code || e.message;
  }

  if (blocked) {
    console.log('2) SWITCH to YEARLY → ❌ BLOCKED with:', blocked, '(bug still present)');
  } else {
    console.log('2) SWITCH to YEARLY →', yearly.orderId, `₹${yearly.amount / 100}`, yearly.billingCycle, '✅ allowed');
  }

  // 3) Ledger state
  const open = await Payment.find({ user: user._id, status: 'created' }).select('gatewayOrderId billingCycle');
  const cancelled = await Payment.countDocuments({ user: user._id, status: 'cancelled' });
  console.log('\n3) Ledger:');
  console.log('   open (created):', open.length, '→', open.map((p) => `${p.billingCycle}:${p.gatewayOrderId}`).join(', '));
  console.log('   cancelled     :', cancelled, '(the released monthly order)');

  const pass =
    !blocked &&
    open.length === 1 &&
    open[0].billingCycle === 'yearly' &&
    cancelled === 1;
  console.log('\n' + (pass ? '✅ PASS — switch works, exactly one open order, monthly released'
                            : '❌ FAIL — unexpected ledger state'));

  await mongoose.disconnect();
  process.exit(pass ? 0 : 1);
})().catch(async (e) => {
  console.error('ERROR:', e);
  await mongoose.disconnect();
  process.exit(1);
});
