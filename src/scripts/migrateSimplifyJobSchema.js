'use strict';

// Strips fields from existing Job documents that were removed from the
// schema (src/models/job.model.js) when the admin panel's Job form was
// simplified to match the approved design — these were confirmed dead
// pass-through in both the admin UI and the mobile app (see job.service.js's
// CrewApply mobile-app field-usage check). `applicationDeadline` is
// deliberately NOT included here — it's still a real schema field, actively
// used by application.service.js's eligibility check.
//
//   node src/scripts/migrateSimplifyJobSchema.js

require('dotenv').config();
const mongoose = require('mongoose');

const REMOVED_FIELDS = [
  'vesselName',
  'joiningLocation',
  'contractDuration',
  'vacancies',
  'urgent',
  'responsibilities',
  'requirements',
  'requiredSkills',
  'requiredCertificates',
  'nationalityRequirements',
  'benefits',
];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  // Use the raw driver collection, NOT the Mongoose Job model — the fields
  // were already removed from job.model.js's schema, and Mongoose's
  // strict-mode update casting silently drops $unset keys that aren't
  // declared on the schema, which would make this a silent no-op.
  const unset = Object.fromEntries(REMOVED_FIELDS.map((field) => [field, 1]));
  const result = await mongoose.connection.collection('jobs').updateMany({}, { $unset: unset });

  console.log(`Matched ${result.matchedCount} job(s), modified ${result.modifiedCount}.`);
  console.log(`Fields stripped: ${REMOVED_FIELDS.join(', ')}`);

  await mongoose.disconnect();
})().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
