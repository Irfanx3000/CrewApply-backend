'use strict';

// Seed the 6 subscription plans (3 tiers × monthly/yearly) with two pricing
// regions each: India (paise, ₹1 = 100) and Global (cents, $1 = 100).
// Re-runnable (upsert by tier+cycle). Admin can edit prices later via the
// admin panel's Subscriptions page (PATCH /api/v1/admin/plans/tier/:tier).
//
//   node src/scripts/seedPlans.js
//
// ⚠️  India amounts below are the app's real, existing prices — unchanged from
//     before this script's country-wise pricing redesign. The Global (USD)
//     amounts are ILLUSTRATIVE PLACEHOLDERS ONLY (a rough, rounded conversion)
//     — review and set real USD pricing via the admin panel before launch.

require('dotenv').config();
const mongoose = require('mongoose');
const Plan = require('../models/plan.model');

const FEATURES = {
  start: ['Apply to 10 jobs / month', 'Access to basic cruise jobs', 'Job alerts (App)', 'Standard application support'],
  premium: ['Apply to 20 jobs/month', 'Access to premium cruise jobs', 'Job alerts (Email + App)', 'Priority application support'],
  elite: ['Unlimited job applications', 'Job alerts (All Channels)', 'Priority support (WhatsApp)', 'Early access to new jobs'],
};

const META = {
  start: { code: 'crew-start', name: 'Crew Start', subtitle: 'For Getting Started', order: 1, limit: 10 },
  premium: { code: 'crew-premium', name: 'Crew Premium', subtitle: 'For serious job seeker', order: 2, limit: 20 },
  elite: { code: 'crew-elite', name: 'Crew Elite', subtitle: 'For Maximum Opportunity', order: 3, limit: null },
};

// [ tier, cycle, intervalDays,
//   indiaLaunchAmount(paise), indiaAmount(paise),
//   globalLaunchAmount(cents, PLACEHOLDER), globalAmount(cents, PLACEHOLDER) ]
// Yearly launch amounts below apply each tier's own current Monthly launch
// discount % to its Yearly price (e.g. Start is 20% off Monthly — 160 vs 200 —
// so its Yearly launch is 20% off 2390 too), so the Yearly cards show the same
// "LAUNCH OFFER" badge + "then …" MRP line the Monthly cards already do.
const ROWS = [
  ['start',   'monthly', 30,  16000,  20000,  199,  299],
  ['premium', 'monthly', 30,  24900,  34900,  299,  499],
  ['elite',   'monthly', 30,  34900,  44900,  499,  599],
  ['start',   'yearly',  365, 191000, 239000, 1999, 2999],
  ['premium', 'yearly',  365, 239000, 335000, 2399, 3999],
  ['elite',   'yearly',  365, 350000, 449900, 4599, 5499],
];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  let n = 0;
  for (const [tier, billingCycle, intervalDays, indiaLaunch, indiaAmount, globalLaunch, globalAmount] of ROWS) {
    const m = META[tier];
    await Plan.findOneAndUpdate(
      { tier, billingCycle },
      {
        // $unset clears the old flat amount/launchAmount/currency fields left
        // over from before the country-wise pricing redesign — Mongoose only
        // manages fields present in $set, so stale docs keep old fields unless
        // explicitly removed.
        $unset: { amount: '', launchAmount: '', currency: '' },
        $set: {
          tier, billingCycle,
          code: m.code, name: m.name, subtitle: m.subtitle,
          pricing: {
            india: { amount: indiaAmount, launchAmount: indiaLaunch },
            global: { amount: globalAmount, launchAmount: globalLaunch },
          },
          intervalDays,
          features: FEATURES[tier], jobApplicationLimit: m.limit,
          isActive: true, displayOrder: m.order,
        },
      },
      // strict:false so the $unset above can actually clear the old fields —
      // Mongoose silently drops updates to paths no longer in the schema
      // otherwise (this doesn't relax validation on the $set half).
      { upsert: true, new: true, setDefaultsOnInsert: true, strict: false }
    );
    n += 1;
    console.log(`  ✓ ${m.name} (${billingCycle}) — India launch ₹${indiaLaunch / 100} then ₹${indiaAmount / 100}; Global launch $${globalLaunch / 100} then $${globalAmount / 100}`);
  }
  console.log(`Seeded/updated ${n} plans.`);
  console.log('⚠️  Global (USD) amounts are placeholders — review/adjust via the admin panel before launch.');
  await mongoose.disconnect();
})().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
