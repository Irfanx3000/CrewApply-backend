'use strict';

// Seed the 6 subscription plans (3 tiers × monthly/yearly) with the current app
// prices. Amounts are in PAISE (₹1 = 100). Re-runnable (upsert by tier+cycle).
// Admin can later edit prices via PATCH /api/v1/admin/plans/:id.
//
//   node src/scripts/seedPlans.js

require('dotenv').config();
const mongoose = require('mongoose');
const Plan = require('../models/plan.model');

const FEATURES = {
  start: ['Apply to 10 jobs / month', 'Access to basic cruise jobs', 'Job alerts (Email)', 'Standard application support'],
  premium: ['Apply to 20 jobs/month', 'Access to premium cruise jobs', 'Job alerts (Email + App)', 'Priority application support'],
  elite: ['Unlimited job applications', 'Job alerts (All Channels)', 'Priority support (WhatsApp)', 'Early access to new jobs'],
};

const META = {
  start: { code: 'crew-start', name: 'Crew Start', subtitle: 'For Getting Started', order: 1, limit: 10 },
  premium: { code: 'crew-premium', name: 'Crew Premium', subtitle: 'For serious job seeker', order: 2, limit: 20 },
  elite: { code: 'crew-elite', name: 'Crew Elite', subtitle: 'For Maximum Opportunity', order: 3, limit: null },
};

// [ tier, cycle, launchAmount(paise), amount(paise), intervalDays ]
const ROWS = [
  ['start',   'monthly', 14900,  24900,  30],
  ['premium', 'monthly', 24900,  34900,  30],
  ['elite',   'monthly', 34900,  44900,  30],
  ['start',   'yearly',  239000, 239000, 365],
  ['premium', 'yearly',  335000, 335000, 365],
  ['elite',   'yearly',  449900, 449900, 365],
];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  let n = 0;
  for (const [tier, billingCycle, launchAmount, amount, intervalDays] of ROWS) {
    const m = META[tier];
    await Plan.findOneAndUpdate(
      { tier, billingCycle },
      {
        $set: {
          tier, billingCycle,
          code: m.code, name: m.name, subtitle: m.subtitle,
          amount, launchAmount, currency: 'INR', intervalDays,
          features: FEATURES[tier], jobApplicationLimit: m.limit,
          isActive: true, displayOrder: m.order,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    n += 1;
    console.log(`  ✓ ${m.name} (${billingCycle}) — launch ₹${launchAmount / 100}, then ₹${amount / 100}`);
  }
  console.log(`Seeded/updated ${n} plans.`);
  await mongoose.disconnect();
})().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
