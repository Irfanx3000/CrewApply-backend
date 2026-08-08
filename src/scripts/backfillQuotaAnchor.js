'use strict';

// Seeds Subscription.quotaAnchor for subscriptions created before application
// quota moved from a calendar month to the billing period.
//
// The anchor is set to currentPeriodStart, which reproduces exactly what
// getQuotaWindow() already falls back to — so running this changes no
// behaviour, it just makes the value explicit and lets a future renewal carry
// a real anchor forward instead of re-deriving one.
//
// Re-runnable: only touches documents where quotaAnchor is missing.
//
//   node src/scripts/backfillQuotaAnchor.js          # apply
//   node src/scripts/backfillQuotaAnchor.js --dry    # report only

require('dotenv').config();
const mongoose = require('mongoose');
const Subscription = require('../models/subscription.model');

const DRY = process.argv.includes('--dry');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const filter = { $or: [{ quotaAnchor: null }, { quotaAnchor: { $exists: false } }] };
  const total = await Subscription.countDocuments(filter);

  if (!total) {
    console.log('Nothing to backfill — every subscription already has a quotaAnchor.');
    await mongoose.disconnect();
    return;
  }

  console.log(`${total} subscription(s) missing quotaAnchor${DRY ? ' (dry run — nothing will be written)' : ''}.`);

  if (DRY) {
    const sample = await Subscription.find(filter).select('user tier currentPeriodStart currentPeriodEnd').limit(5).lean();
    sample.forEach((s) => {
      console.log(`  ${s.tier.padEnd(8)} user=${s.user}  anchor would be ${s.currentPeriodStart.toISOString()}`);
    });
    await mongoose.disconnect();
    return;
  }

  // Copying one field to another is a per-document value, so this reads each
  // subscription and writes its own currentPeriodStart back as the anchor.
  //
  // Deliberately bulkWrite rather than an aggregation-pipeline updateMany
  // (`[{ $set: { quotaAnchor: '$currentPeriodStart' } }]`): Mongoose 8 rejects
  // a pipeline array unless `updatePipeline` is set, and that flag's
  // availability varies by version. bulkWrite behaves identically everywhere.
  const BATCH = 500;
  let ops = [];
  let written = 0;
  let skipped = 0;

  const flush = async () => {
    if (!ops.length) return;
    const res = await Subscription.bulkWrite(ops, { ordered: false });
    written += res.modifiedCount || 0;
    ops = [];
  };

  const cursor = Subscription.find(filter).select('currentPeriodStart').lean().cursor();
  for await (const doc of cursor) {
    if (!doc.currentPeriodStart) {
      skipped += 1; // nothing sensible to anchor to — left for manual review
      continue;
    }
    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { quotaAnchor: doc.currentPeriodStart } },
      },
    });
    if (ops.length >= BATCH) await flush();
  }
  await flush();

  console.log(`Backfilled ${written} subscription(s).`);
  if (skipped) console.warn(`Skipped ${skipped} with no currentPeriodStart.`);

  const remaining = await Subscription.countDocuments(filter);
  if (remaining) console.warn(`WARNING: ${remaining} still missing an anchor — check for documents with no currentPeriodStart.`);

  await mongoose.disconnect();
})().catch((e) => {
  console.error('Backfill failed:', e.message);
  process.exit(1);
});
