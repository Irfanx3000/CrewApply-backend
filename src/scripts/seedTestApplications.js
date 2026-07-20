'use strict';

// Seeds a handful of Applications across every APPLICATION_STATUSES value,
// plus supporting Documents, so the admin Applications page has real,
// varied data to render (including varying "live" document-completeness
// percentages). Re-runnable: clears prior seed-created docs/apps by a
// marker field before recreating.
//
//   node src/scripts/seedTestApplications.js

require('dotenv').config();
const mongoose = require('mongoose');
const Application = require('../models/application.model');
const Document = require('../models/document.model');
const User = require('../models/user.model');
const Job = require('../models/job.model');

const SEED_TAG = 'seedTestApplications';

async function ensureDocument(userId, category, active) {
  return Document.create({
    user: userId,
    category,
    originalName: `${category}.pdf`,
    storedName: `${SEED_TAG}-${userId}-${category}.pdf`,
    path: `seed/${SEED_TAG}/${userId}/${category}.pdf`,
    mimeType: 'application/pdf',
    size: 1024,
    status: active ? 'active' : 'archived',
    metadata: { seedTag: SEED_TAG },
  });
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  // Clean up any previous run's seeded Documents first (idempotent).
  await Document.deleteMany({ 'metadata.seedTag': SEED_TAG });

  const users = await User.find({ role: 'user' }).select('_id name').limit(5).lean();
  const thirdOfficer = await Job.findOne({ title: 'Third Officer' }).lean();
  const captain = await Job.findOne({ title: 'Captain' }).lean();

  if (users.length < 5 || !thirdOfficer || !captain) {
    throw new Error('Not enough seed users/jobs found — run seedAdminUser.js and ensure jobs exist first.');
  }

  const required = thirdOfficer.requiredDocuments || [];
  const plan = [
    { user: users[0], job: thirdOfficer, status: 'applied', activeCategories: required },
    { user: users[1], job: thirdOfficer, status: 'under_review', activeCategories: required.slice(0, 3) },
    { user: users[2], job: thirdOfficer, status: 'interview_scheduled', activeCategories: required.slice(0, 2) },
    { user: users[3], job: thirdOfficer, status: 'selected', activeCategories: required },
    { user: users[4], job: thirdOfficer, status: 'rejected', activeCategories: required.slice(0, 1) },
    { user: users[0], job: captain, status: 'withdrawn', activeCategories: [] },
  ];

  // Clean up any previous run's seeded Applications by the exact (user,job)
  // pairs this script creates — no schema field needed for tracking.
  await Application.deleteMany({
    $or: plan.map((row) => ({ user: row.user._id, job: row.job._id })),
  });

  for (const row of plan) {
    // Seed one Document per required category — active for the ones this
    // row should count as "complete", archived for the rest (so the live
    // completeness % genuinely varies).
    const submittedDocuments = [];
    for (const category of required) {
      const isActive = row.activeCategories.includes(category);
      const doc = await ensureDocument(row.user._id, category, isActive);
      if (isActive) submittedDocuments.push({ category, document: doc._id });
    }

    await Application.create({
      user: row.user._id,
      job: row.job._id,
      status: row.status,
      submittedDocuments,
      statusUpdatedAt: new Date(),
      withdrawnAt: row.status === 'withdrawn' ? new Date() : null,
    });

    console.log(`  ✓ ${row.user.name} → ${row.job.title} (${row.status})`);
  }

  console.log(`Seeded ${plan.length} test applications.`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error('Seed failed:', e.message);
  process.exit(1);
});
