'use strict';

/**
 * Proves referral attribution survives the REAL HTTP controller layer —
 * unlike testReferral.js, which calls authService/subscriptionService
 * directly and therefore could never have caught the bug where
 * auth.controller.js's register handler manually destructured req.body
 * and silently dropped referralCode before it ever reached the service.
 *
 * This script boots the actual Express app (app.js) on an ephemeral port
 * and drives it with real HTTP requests:
 *   1) POST /auth/register with a valid referralCode -> referralApplied: true,
 *      and after POST /auth/verify-mobile, a Referral{status:'pending'} row
 *      exists tying the new user to the referrer.
 *   2) POST /auth/register with a garbage referralCode -> referralApplied:
 *      false, registration still succeeds, no Referral row is created.
 *
 * Run: node src/scripts/testReferralHttp.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Referral = require('../models/referral.model');
const Otp = require('../models/otp.model');
const referralService = require('../services/referral.service');

const results = [];
const check = (label, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? '✅' : '❌'} ${label}${detail !== undefined ? ' — ' + detail : ''}`);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (checkFn, { tries = 15, delayMs = 200 } = {}) => {
  for (let i = 0; i < tries; i++) {
    const result = await checkFn();
    if (result) return result;
    await sleep(delayMs);
  }
  return null;
};

const resetUser = async (email, phone) => {
  const user = await User.findOne({ email });
  if (user) {
    await Referral.deleteMany({ $or: [{ referrer: user._id }, { referee: user._id }] });
    await Otp.deleteMany({ phone });
    await User.deleteOne({ _id: user._id });
  }
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ DB connected\n');

  // The dev SMS fallback (sms.service.js) console.logs the OTP body — capture
  // it by wrapping console.log rather than trying to reach past the
  // fire-and-forget sendOtpSms() call inside auth.service.js's register().
  let capturedOtp = null;
  const originalLog = console.log;
  console.log = (...args) => {
    originalLog(...args);
    const match = String(args[0] || '').match(/verification code is: (\d{6})/);
    if (match) capturedOtp = match[1];
  };

  const app = require('../../app');
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  try {
    const referrerEmail = 'referral.httpreferrer@example.com';
    const refereeEmail = 'referral.httpreferee@example.com';
    const invalidEmail = 'referral.httpinvalid@example.com';
    const refereePhone = '+919000000301';
    const invalidPhone = '+919000000302';

    await resetUser(referrerEmail, '+919000000300');
    await resetUser(refereeEmail, refereePhone);
    await resetUser(invalidEmail, invalidPhone);

    const referrer = await User.create({
      name: 'Referral Http Referrer',
      email: referrerEmail,
      password: 'Passw0rd!23',
      phone: '+919000000300',
      phoneVerified: true,
      isActive: true,
      referralCode: await referralService.generateUniqueReferralCode(),
    });
    console.log(`✓ seeded referrer — code: ${referrer.referralCode}\n`);

    // ── 1) Valid code through the real HTTP register endpoint ───────────────
    capturedOtp = null;
    const registerRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Referral Http Referee',
        dateOfBirth: '1995-01-01',
        gender: 'Male',
        nationality: 'Indian',
        country: 'India',
        phone: refereePhone,
        email: refereeEmail,
        password: 'Passw0rd!23',
        referralCode: referrer.referralCode,
      }),
    });
    const registerBody = await registerRes.json();
    check('HTTP register: request succeeded', registerRes.status === 201 || registerRes.status === 200, registerRes.status);
    check('HTTP register: referralApplied is true for a valid code', registerBody?.data?.referralApplied === true, JSON.stringify(registerBody?.data));

    const refereeAfterRegister = await User.findOne({ email: refereeEmail });
    check('HTTP register: referredBy set on the (still-unverified) user', String(refereeAfterRegister?.referredBy) === String(referrer._id));

    const otp = await waitFor(() => capturedOtp);
    check('HTTP register: OTP was sent (captured from dev SMS log)', !!otp, otp);

    const verifyRes = await fetch(`${baseUrl}/auth/verify-mobile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: refereePhone, otp }),
    });
    check('HTTP verify-mobile: request succeeded', verifyRes.status === 200, verifyRes.status);

    const referralRow = await waitFor(() => Referral.findOne({ referrer: referrer._id, referee: refereeAfterRegister._id }));
    check('HTTP verify-mobile: Referral row created with status=pending', referralRow?.status === 'pending', referralRow?.status);

    // ── 2) Invalid/unknown code — registration still succeeds, no attribution ─
    capturedOtp = null;
    const invalidRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Referral Http Invalid',
        dateOfBirth: '1995-01-01',
        gender: 'Male',
        nationality: 'Indian',
        country: 'India',
        phone: invalidPhone,
        email: invalidEmail,
        password: 'Passw0rd!23',
        referralCode: 'NOTAREALCODE',
      }),
    });
    const invalidBody = await invalidRes.json();
    check('HTTP register: invalid code still returns success', invalidRes.status === 201 || invalidRes.status === 200, invalidRes.status + ' ' + JSON.stringify(invalidBody));
    check('HTTP register: referralApplied is false for an unknown code', invalidBody?.data?.referralApplied === false, JSON.stringify(invalidBody?.data));

    const invalidUser = await User.findOne({ email: invalidEmail });
    check('HTTP register: no referredBy set for an invalid code', invalidUser?.referredBy == null);

    const pass = results.every(Boolean);
    console.log('\n' + (pass ? '✅ PASS — referral attribution survives the real HTTP controller layer' : '❌ FAIL — see above'));

    await resetUser(referrerEmail, '+919000000300');
    await resetUser(refereeEmail, refereePhone);
    await resetUser(invalidEmail, invalidPhone);

    console.log = originalLog;
    server.close();
    await mongoose.disconnect();
    process.exit(pass ? 0 : 1);
  } catch (e) {
    console.log = originalLog;
    server.close();
    throw e;
  }
})().catch(async (e) => {
  console.error('ERROR:', e);
  await mongoose.disconnect();
  process.exit(1);
});
