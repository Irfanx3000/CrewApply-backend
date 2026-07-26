'use strict';

// Seed the departments/vessel types that previously lived as hardcoded enums
// (Job.JOB_DEPARTMENTS / Job.JOB_VESSEL_TYPES). Preserves today's exact 6
// departments + 10 vessel types so existing Job documents' stored strings
// remain valid. Re-runnable (upsert by {type, name}). Admin can add more
// later via the admin panel's job form or POST /api/v1/admin/job-taxonomies.
//
// IMPORTANT: run this BEFORE deploying the job.model.js/job.validation.js
// changes that switch department/vesselType validation to check against this
// collection — otherwise every job create/update would fail validation until
// the collection is seeded.
//
//   node src/scripts/seedJobTaxonomy.js

require('dotenv').config();
const mongoose = require('mongoose');
const JobTaxonomy = require('../models/jobTaxonomy.model');

const DEPARTMENTS = [
  'Deck',
  'Engine',
  'Electrical',
  'Catering / Galley',
  'Hotel / Hospitality',
  'Medical',
];

const VESSEL_TYPES = [
  'Cruise',
  'Container',
  'Tanker',
  'Bulk Carrier',
  'Offshore',
  'LNG Carrier',
  'LPG Carrier',
  'Chemical Tanker',
  'Ro-Ro',
  'Tug',
];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  let n = 0;
  for (const [type, list] of [['department', DEPARTMENTS], ['vesselType', VESSEL_TYPES]]) {
    for (const [i, name] of list.entries()) {
      await JobTaxonomy.findOneAndUpdate(
        { type, name },
        { $set: { type, name, isActive: true, sortOrder: (i + 1) * 10 } },
        { upsert: true, new: true, setDefaultsOnInsert: true, collation: { locale: 'en', strength: 2 } }
      );
      n += 1;
      console.log(`  ✓ [${type}] ${name}`);
    }
  }
  console.log(`Seeded/updated ${n} job taxonomy entries.`);
  await mongoose.disconnect();
})().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
