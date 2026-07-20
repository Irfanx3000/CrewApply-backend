'use strict';

/**
 * Proves the two new subscription gates in application.service.js's applyToJob:
 *  1) Monthly application limit (start tier = 10/month): 10 succeed, 11th blocked
 *     with APPLICATION_LIMIT_REACHED; withdrawing one frees a slot; an application
 *     dated last month doesn't count toward this month's usage.
 *  2) Job-tier gate: a start-tier user is blocked from an elite-tagged job with
 *     TIER_REQUIRED; succeeds once bumped to elite. checkEligibility mirrors both.
 *
 * Run: node src/scripts/testGating.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Plan = require('../models/plan.model');
const Job = require('../models/job.model');
const Application = require('../models/application.model');
const Subscription = require('../models/subscription.model');
const applicationService = require('../services/application.service');

const DAY = 24 * 60 * 60 * 1000;
const JOB_TITLE_PREFIX = 'GATING_TEST_JOB_';

const freshUser = async (u) => User.findById(u._id);

const baseJobFields = (createdBy) => ({
  companyName: 'Gating Test Co',
  department: 'Deck',
  rank: 'Test Rank',
  vesselType: 'Cruise',
  location: { country: 'India' },
  employmentType: 'Full Time',
  description: 'Test fixture job for gating verification.',
  requiredDocuments: [],
  status: 'published',
  publishedAt: new Date(),
  createdBy,
});

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ DB connected\n');

  // ── Reset fixtures (idempotent — safe to re-run) ────────────────────────────
  const email = 'gating.test@example.com';
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      name: 'Gating Test', email, password: 'Passw0rd!23',
      phone: '+919000000099', phoneVerified: true, isActive: true,
    });
  }
  await Job.deleteMany({ title: new RegExp(`^${JOB_TITLE_PREFIX}`) });
  await Application.deleteMany({ user: user._id });
  await Subscription.deleteMany({ user: user._id });

  const startPlan = await Plan.findOne({ tier: 'start', billingCycle: 'monthly' });
  if (!startPlan) throw new Error('start/monthly Plan not seeded — run seedPlans.js first.');

  const now = new Date();
  await Subscription.create({
    user: user._id, plan: startPlan._id, tier: 'start', billingCycle: 'monthly',
    status: 'active', currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 30 * DAY),
  });
  await User.updateOne({ _id: user._id }, {
    $set: { subscriptionTier: 'start', subscriptionStatus: 'active', subscriptionExpiresAt: new Date(now.getTime() + 30 * DAY) },
  });
  user = await freshUser(user);
  console.log(`✓ reset test user on 'start' plan (limit ${startPlan.jobApplicationLimit})\n`);

  // 11 distinct start-tier jobs (limit test needs distinct jobs — dup-application
  // is its own separate gate) + 1 elite-tier job (tier-gate test).
  const startJobs = [];
  for (let i = 1; i <= 11; i++) {
    startJobs.push(await Job.create({ ...baseJobFields(user._id), title: `${JOB_TITLE_PREFIX}START_${i}`, minimumTier: 'start' }));
  }
  const eliteJob = await Job.create({ ...baseJobFields(user._id), title: `${JOB_TITLE_PREFIX}ELITE_1`, minimumTier: 'elite' });
  console.log('✓ created 11 start-tier jobs + 1 elite-tier job\n');

  const results = [];
  const check = (label, ok, detail) => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`); };

  // ── 1) Monthly limit: first 10 succeed ──────────────────────────────────────
  for (let i = 0; i < 10; i++) {
    try {
      await applicationService.applyToJob(user, startJobs[i]._id);
    } catch (e) {
      check(`limit: application #${i + 1} succeeds`, false, e.code || e.message);
    }
  }
  check('limit: 10 applications this month all succeeded', (await Application.countDocuments({ user: user._id })) === 10);

  // 11th (distinct job) should be blocked
  let eleventhCode = null;
  try {
    await applicationService.applyToJob(user, startJobs[10]._id);
  } catch (e) { eleventhCode = e.code; }
  check('limit: 11th application blocked with APPLICATION_LIMIT_REACHED', eleventhCode === 'APPLICATION_LIMIT_REACHED', eleventhCode);

  // eligibility mirrors enforcement
  const eligibilityAtLimit = await applicationService.checkEligibility(user, startJobs[10]._id);
  check('limit: checkEligibility reports applicationsRemaining=0', eligibilityAtLimit.applicationsRemaining === 0);
  check('limit: checkEligibility reports eligible=false at the cap', eligibilityAtLimit.eligible === false);

  // Withdrawing frees a slot
  const firstApp = await Application.findOne({ user: user._id, job: startJobs[0]._id });
  await applicationService.withdrawApplication(user._id, firstApp._id);
  let afterWithdrawOk = true;
  try {
    await applicationService.applyToJob(user, startJobs[10]._id);
  } catch (e) { afterWithdrawOk = false; }
  check('limit: withdrawing one frees a slot for the 11th job', afterWithdrawOk);

  // Calendar-month reset: an application dated last month shouldn't count.
  // Push one of this month's applications back a month, confirm usage drops.
  const usageBefore = await applicationService.getApplicationUsage(user);
  const someApp = await Application.findOne({ user: user._id, status: { $ne: 'withdrawn' } }).sort({ createdAt: 1 });
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  // Mongoose's timestamps plugin protects `createdAt` from being touched by
  // update queries (silently strips it, only bumping updatedAt) — go through
  // the raw collection driver to actually backdate this fixture.
  await Application.collection.updateOne({ _id: someApp._id }, { $set: { createdAt: lastMonth } });
  const usageAfter = await applicationService.getApplicationUsage(user);
  check('limit: backdating an application to last month reduces this month\'s usage', usageAfter.applicationsUsed === usageBefore.applicationsUsed - 1);

  // ── 2) Job-tier gate ─────────────────────────────────────────────────────────
  let tierBlockedCode = null;
  try {
    await applicationService.applyToJob(user, eliteJob._id);
  } catch (e) { tierBlockedCode = e.code; }
  check('tier: start-tier user blocked from elite job with TIER_REQUIRED', tierBlockedCode === 'TIER_REQUIRED', tierBlockedCode);

  const eligibilityForElite = await applicationService.checkEligibility(user, eliteJob._id);
  check('tier: checkEligibility reports meetsTierRequirement=false', eligibilityForElite.meetsTierRequirement === false);

  // Bump to elite — should now succeed (elite has no application limit either).
  // Must repoint `plan` too, not just the `tier` string snapshot: the limit
  // check reads the *referenced* Plan doc's jobApplicationLimit, exactly like
  // a real upgrade creates a new Subscription pointing at the new Plan.
  const elitePlan = await Plan.findOne({ tier: 'elite', billingCycle: 'monthly' });
  await User.updateOne({ _id: user._id }, { $set: { subscriptionTier: 'elite' } });
  await Subscription.updateOne({ user: user._id, status: 'active' }, { $set: { tier: 'elite', plan: elitePlan._id } });
  user = await freshUser(user);
  let eliteAppliedOk = true;
  try {
    await applicationService.applyToJob(user, eliteJob._id);
  } catch (e) { eliteAppliedOk = false; console.log('   →', e.code || e.message); }
  check('tier: elite-tier user can apply to the elite job', eliteAppliedOk);

  const pass = results.every(Boolean);
  console.log('\n' + (pass ? '✅ PASS — both gates enforced correctly' : '❌ FAIL — see above'));

  await mongoose.disconnect();
  process.exit(pass ? 0 : 1);
})().catch(async (e) => {
  console.error('ERROR:', e);
  await mongoose.disconnect();
  process.exit(1);
});
