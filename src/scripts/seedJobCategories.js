'use strict';

// Seeds the 5 categories that previously lived as a hardcoded array in the
// mobile app (CrewApply/src/constants/categories.constants.js) into the
// admin-manageable JobTaxonomy collection (type:'category'), so the mobile
// home screen's "Categories" section can become data-driven without any
// visible change on day one — each gets `icon.key` matching its existing
// bundled SVG asset (see CrewApply/src/components/home/CategoryCard.jsx).
// Re-runnable (upsert by {type, name}).
//
//   node src/scripts/seedJobCategories.js

require('dotenv').config();
const mongoose = require('mongoose');
const JobTaxonomy = require('../models/jobTaxonomy.model');

const CATEGORIES = [
  { name: 'Deck', iconKey: 'deck' },
  { name: 'Engine', iconKey: 'engine' },
  { name: 'Hospitality', iconKey: 'hospitality' },
  { name: 'Catering', iconKey: 'catering' },
  { name: 'Others', iconKey: 'others' },
];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  let n = 0;
  for (const [i, { name, iconKey }] of CATEGORIES.entries()) {
    await JobTaxonomy.findOneAndUpdate(
      { type: 'category', name },
      {
        $set: {
          type: 'category',
          name,
          isActive: true,
          sortOrder: (i + 1) * 10,
          icon: { type: 'default', key: iconKey },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, collation: { locale: 'en', strength: 2 } }
    );
    n += 1;
    console.log(`  ✓ [category] ${name} (icon: ${iconKey})`);
  }
  console.log(`Seeded/updated ${n} category taxonomy entries.`);
  await mongoose.disconnect();
})().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
