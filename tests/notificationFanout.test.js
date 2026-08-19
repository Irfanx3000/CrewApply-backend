'use strict';

// Job-alert fan-out regression test.
//
// Runs against an ISOLATED database on the configured cluster
// (<your db>_hardening_test) which is dropped at the end, so it never touches
// real user data. Uses Node's built-in test runner — no new dependency.
//
//   node --test tests/
//
// What it pins down, all of which the batching rewrite could plausibly have
// broken:
//   * exactly the right users are notified (tier arm + category arm)
//   * a user matching BOTH arms is notified exactly once
//   * ineligible users are not notified at all
//   * email is sent only to non-'start' tiers
//   * a user who opted out of push still gets the in-app notification
//   * batching actually engages (seeded above FANOUT_BATCH_SIZE)
//   * one failing send does not stop the rest of the batch

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

require('dotenv').config({ quiet: true });

const TEST_DB = 'crewapply_hardening_test';
const SEED_COUNT = 1200; // > FANOUT_BATCH_SIZE (500), so at least 3 batches

// Point the connection at a throwaway database on the same cluster.
const testUri = () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required to run these tests.');
  const [base, query] = uri.split('?');
  const withoutDb = base.replace(/\/[^/]*$/, '');
  return `${withoutDb}/${TEST_DB}${query ? `?${query}` : ''}`;
};

let User;
let Notification;
let notificationService;
let pushService;
let emailService;

// Call recorders, installed over the real services so nothing leaves the machine.
const calls = { push: [], email: [], pushOptOut: 0 };
let failEveryNthSend = 0;

test.before(async () => {
  await mongoose.connect(testUri());

  User = require('../src/models/user.model');
  Notification = require('../src/models/notification.model');
  pushService = require('../src/services/push.service');
  emailService = require('../src/services/email.service');
  notificationService = require('../src/services/notification.service');

  await User.syncIndexes();

  // Stub the two outbound channels. Overwriting the property on the shared
  // module object works because notification.service holds the module, not the
  // function — so this intercepts without touching production code.
  pushService.sendToUser = async (userId, payload, preloaded) => {
    // Assert the N+1 fix is actually in play: the fan-out must hand us the
    // already-loaded user rather than making us look it up.
    assert.ok(preloaded, 'fan-out must pass the preloaded user to sendToUser');
    if (preloaded.pushNotificationsEnabled === false) {
      calls.pushOptOut += 1;
      return;
    }
    calls.push.push(String(userId));
  };

  emailService.sendJobAlertEmail = async (email) => {
    calls.email.push(email);
    if (failEveryNthSend && calls.email.length % failEveryNthSend === 0) {
      throw new Error('simulated mail provider failure');
    }
  };
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

const resetCalls = () => {
  calls.push = [];
  calls.email = [];
  calls.pushOptOut = 0;
};

/**
 * Seeds a deliberately mixed population:
 *   premium/elite active  -> matched by the TIER arm
 *   start active          -> matched by tier arm (start qualifies for a
 *                            minimumTier:'start' job), no email
 *   expired premium       -> matched by NEITHER arm
 *   no-sub + category     -> matched by the CATEGORY arm only
 *   active elite + category -> matches BOTH arms (the de-duplication case)
 */
const seedUsers = async () => {
  const docs = [];
  for (let i = 0; i < SEED_COUNT; i += 1) {
    const bucket = i % 6;
    const base = {
      name: `Fanout User ${i}`,
      email: `fanout${i}@example.test`,
      password: 'Passw0rd!seed',
      phone: `+91900000${String(i).padStart(4, '0')}`,
      isActive: true,
      pushNotificationsEnabled: bucket !== 5, // one bucket opts out of push
      deviceTokens: [{ token: `tok-${i}`, platform: 'android' }],
    };
    if (bucket === 0) Object.assign(base, { subscriptionStatus: 'active', subscriptionTier: 'premium' });
    if (bucket === 1) Object.assign(base, { subscriptionStatus: 'active', subscriptionTier: 'elite' });
    if (bucket === 2) Object.assign(base, { subscriptionStatus: 'active', subscriptionTier: 'start' });
    if (bucket === 3) Object.assign(base, { subscriptionStatus: 'expired', subscriptionTier: 'premium' });
    if (bucket === 4) Object.assign(base, { preferredCategories: ['Deck'] });
    if (bucket === 5) Object.assign(base, { subscriptionStatus: 'active', subscriptionTier: 'elite', preferredCategories: ['Deck'] });
    docs.push(base);
  }
  await User.insertMany(docs, { ordered: false });
};

const fakeJob = {
  _id: new mongoose.Types.ObjectId(),
  title: 'Second Officer',
  companyName: 'Test Lines',
  rank: 'Second Officer',
  department: 'Deck',
  category: 'Deck',
  minimumTier: 'start',
};

test('fan-out notifies exactly the eligible users, once each', async () => {
  await seedUsers();
  resetCalls();
  failEveryNthSend = 0;

  await notificationService.notifyEligibleUsersForJob(fakeJob);

  const notifications = await Notification.find({ 'data.jobId': fakeJob._id }).lean();

  // Expected set, computed independently of the implementation.
  const eligible = await User.find({
    $or: [
      { subscriptionStatus: 'active', subscriptionTier: { $in: ['start', 'premium', 'elite'] } },
      { preferredCategories: 'Deck' },
    ],
  }).select('_id').lean();

  assert.equal(notifications.length, eligible.length,
    'one notification per eligible user');

  const recipients = notifications.map((n) => String(n.user));
  assert.equal(new Set(recipients).size, recipients.length,
    'no user notified twice (the $or must de-duplicate the two match arms)');

  // The expired-premium bucket (1/6th) must be excluded entirely.
  const expired = await User.find({ subscriptionStatus: 'expired' }).select('_id').lean();
  const expiredIds = new Set(expired.map((u) => String(u._id)));
  assert.ok(expired.length > 0, 'sanity: seeded some ineligible users');
  assert.ok(recipients.every((id) => !expiredIds.has(id)),
    'expired subscribers with no category preference must not be notified');
});

test('batching engages above the batch size', async () => {
  const notifications = await Notification.countDocuments({ 'data.jobId': fakeJob._id });
  assert.ok(notifications > 500,
    `seeded population must exceed FANOUT_BATCH_SIZE to exercise batching (got ${notifications})`);
});

test('email is tier-gated; push respects the opt-out', async () => {
  const startTier = await User.countDocuments({ subscriptionStatus: 'active', subscriptionTier: 'start' });
  assert.ok(startTier > 0, 'sanity: seeded some start-tier users');

  // Every email recipient must be a non-start tier.
  const startEmails = new Set(
    (await User.find({ subscriptionTier: 'start' }).select('email').lean()).map((u) => u.email)
  );
  assert.ok(calls.email.every((e) => !startEmails.has(e)),
    'start-tier users must not receive the job-alert email');

  assert.ok(calls.pushOptOut > 0, 'sanity: seeded users who opted out of push');
  const optedOut = await User.countDocuments({ pushNotificationsEnabled: false });
  const optedOutNotified = await Notification.countDocuments({
    'data.jobId': fakeJob._id,
    user: { $in: (await User.find({ pushNotificationsEnabled: false }).select('_id').lean()).map((u) => u._id) },
  });
  assert.equal(optedOutNotified, optedOut,
    'opting out of push must NOT suppress the in-app notification');
});

test('one failing send does not stop the rest of the batch', async () => {
  const job2 = { ...fakeJob, _id: new mongoose.Types.ObjectId(), title: 'Third Officer' };
  resetCalls();
  failEveryNthSend = 3; // every third email throws

  await notificationService.notifyEligibleUsersForJob(job2);

  const written = await Notification.countDocuments({ 'data.jobId': job2._id });
  const eligible = await User.countDocuments({
    $or: [
      { subscriptionStatus: 'active', subscriptionTier: { $in: ['start', 'premium', 'elite'] } },
      { preferredCategories: 'Deck' },
    ],
  });

  assert.equal(written, eligible,
    'in-app notifications must all be written even when sends fail');
  assert.ok(calls.email.length > 10,
    'delivery must have continued past the failures, not aborted on the first');
});
