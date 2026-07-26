'use strict';

/**
 * Proves Part B — renewal window + period extension:
 *  1) First purchase → active, ends ~+30d (launch price 24900).
 *  2) Force the plan to be 3 days from expiry.
 *  3) Renewal order (same tier) is ALLOWED (within 7-day window) and charges the
 *     standard price (34900, not the launch price).
 *  4) After activation the new expiry STACKS on the remaining time (~+33d), not reset to +30d.
 *  5) Far from expiry (+20d), a same-tier purchase is BLOCKED (ALREADY_SUBSCRIBED).
 *
 * Run: node src/scripts/testRenewal.js
 */

require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Payment = require('../models/payment.model');
const Subscription = require('../models/subscription.model');
const subscriptionService = require('../services/subscription.service');
const paymentService = require('../services/payment.service');

const fakeReq = { ip: '127.0.0.1', get: () => 'test-script' };
const DAY = 24 * 60 * 60 * 1000;

// Activate an order the authoritative way: a signed order.paid webhook.
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

const freshUser = async (u) => User.findById(u._id); // re-read cached entitlement

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ DB connected\n');

  const email = 'renewal.test@example.com';
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      name: 'Renewal Test', email, password: 'Passw0rd!23',
      phone: '+919000000043', phoneVerified: true, isActive: true, country: 'India',
    });
  } else if (user.country !== 'India') {
    user.country = 'India';
    await user.save();
  }
  await Payment.deleteMany({ user: user._id });
  await Subscription.deleteMany({ user: user._id });
  await User.updateOne({ _id: user._id }, { $set: { subscriptionTier: null, subscriptionStatus: null, subscriptionExpiresAt: null } });
  user = await freshUser(user);
  console.log('✓ reset test user\n');

  // 1) First purchase
  const o1 = await subscriptionService.createOrder({ user, tier: 'premium', billingCycle: 'monthly' }, fakeReq);
  console.log('1) first order  →', `₹${o1.amount / 100}`, '(expect ₹249 launch)');
  await payViaWebhook(o1.orderId, o1.amount);
  let sub = await Subscription.findOne({ user: user._id, status: 'active' });
  const firstEnd = sub.currentPeriodEnd;
  console.log('   activated, ends', firstEnd.toISOString().slice(0, 10), '\n');

  // 2) Force near-expiry: 3 days left
  const threeDaysOut = new Date(Date.now() + 3 * DAY);
  await Subscription.updateOne({ _id: sub._id }, { $set: { currentPeriodEnd: threeDaysOut } });
  await User.updateOne({ _id: user._id }, { $set: { subscriptionExpiresAt: threeDaysOut, subscriptionTier: 'premium', subscriptionStatus: 'active' } });
  user = await freshUser(user);
  console.log('2) forced expiry to', threeDaysOut.toISOString().slice(0, 10), '(3 days left)\n');

  // 3) Renewal order — should be ALLOWED, standard price
  let o2, renewBlocked = null;
  try {
    o2 = await subscriptionService.createOrder({ user, tier: 'premium', billingCycle: 'monthly' }, fakeReq);
  } catch (e) { renewBlocked = e.errorCode || e.code || e.message; }
  if (renewBlocked) {
    console.log('3) renewal order → ❌ BLOCKED:', renewBlocked);
  } else {
    console.log('3) renewal order → ✅ allowed,', `₹${o2.amount / 100}`, '(expect ₹349 standard, not launch)');
  }

  // 4) Activate renewal → expiry should STACK on the 3 remaining days
  let stackedOk = false, newEnd;
  if (o2) {
    await payViaWebhook(o2.orderId, o2.amount);
    sub = await Subscription.findOne({ user: user._id, status: 'active' }).sort({ currentPeriodEnd: -1 });
    newEnd = sub.currentPeriodEnd;
    const expected = new Date(threeDaysOut.getTime() + 30 * DAY);
    stackedOk = Math.abs(newEnd.getTime() - expected.getTime()) < 2 * DAY; // ~33d out
    console.log('4) renewed expiry →', newEnd.toISOString().slice(0, 10),
      `(expect ~${expected.toISOString().slice(0, 10)} = 3 + 30 days)`, stackedOk ? '✅' : '❌');
  }

  // 5) Far from expiry → block
  const farOut = new Date(Date.now() + 20 * DAY);
  await User.updateOne({ _id: user._id }, { $set: { subscriptionExpiresAt: farOut, subscriptionTier: 'premium', subscriptionStatus: 'active' } });
  user = await freshUser(user);
  let farBlocked = null;
  try {
    await subscriptionService.createOrder({ user, tier: 'premium', billingCycle: 'monthly' }, fakeReq);
  } catch (e) { farBlocked = e.errorCode || e.code || e.message; }
  console.log('5) purchase 20 days from expiry →', farBlocked === 'ALREADY_SUBSCRIBED' ? '✅ BLOCKED (ALREADY_SUBSCRIBED)' : `❌ ${farBlocked || 'allowed'}`);

  const pass = !renewBlocked && o2 && o2.amount === 34900 && stackedOk && farBlocked === 'ALREADY_SUBSCRIBED';
  console.log('\n' + (pass ? '✅ PASS — renewal window enforced, standard price, period extended'
                            : '❌ FAIL — see above'));

  await mongoose.disconnect();
  process.exit(pass ? 0 : 1);
})().catch(async (e) => {
  console.error('ERROR:', e);
  await mongoose.disconnect();
  process.exit(1);
});
