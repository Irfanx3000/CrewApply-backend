'use strict';

// Creates any schema-declared index that does not yet exist in the database.
//
//   node src/scripts/syncIndexes.js            # report + create
//   node src/scripts/syncIndexes.js --dry-run  # report only
//
// REQUIRED AS A DEPLOY STEP. Production runs with autoIndex disabled (see
// config/db.js) so that 24 models' indexes are not rebuilt on every single
// boot. The cost of that is exactly this: a newly declared index does NOT
// appear on its own, and the query it was meant to serve quietly falls back to
// a collection scan — fast on a small collection, and progressively slower with
// no error to notice.
//
// Uses syncIndexes(), which creates what is missing and drops indexes that are
// no longer declared in the schema. It does NOT touch the _id index or anything
// created outside Mongoose.

require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const MODELS_DIR = path.join(__dirname, '..', 'models');

(async () => {
  const dryRun = process.argv.includes('--dry-run');

  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  const host = mongoose.connection.host;
  const dbName = mongoose.connection.name;
  console.log(`Connected: ${host}/${dbName}${dryRun ? '  (dry run)' : ''}\n`);

  // Load every model so mongoose knows about all declared indexes.
  for (const file of fs.readdirSync(MODELS_DIR).filter((f) => f.endsWith('.model.js'))) {
    require(path.join(MODELS_DIR, file));
  }

  let created = 0;
  let dropped = 0;

  for (const name of mongoose.modelNames().sort()) {
    const Model = mongoose.model(name);

    let existing;
    try {
      existing = await Model.collection.indexes();
    } catch {
      // Collection does not exist yet — nothing to sync, and syncIndexes would
      // create it as a side effect, which is not this script's job.
      continue;
    }
    const existingNames = new Set(existing.map((i) => i.name));

    // What the schema declares, as mongoose would name it.
    const declared = Model.schema.indexes();
    const missing = declared.filter(([keys, opts]) => {
      const guess = opts?.name || Object.entries(keys).map(([k, v]) => `${k}_${v}`).join('_');
      return !existingNames.has(guess);
    });

    if (missing.length === 0) continue;

    console.log(`${name}`);
    missing.forEach(([keys, opts]) => {
      console.log(`   + ${JSON.stringify(keys)}${opts && Object.keys(opts).length ? '  ' + JSON.stringify(opts) : ''}`);
    });

    if (!dryRun) {
      const result = await Model.syncIndexes();
      dropped += Array.isArray(result) ? result.length : 0;
      created += missing.length;
    }
  }

  if (created === 0 && dryRun === false) {
    console.log('Every declared index already exists — nothing to do.');
  } else if (dryRun) {
    console.log('\nDry run: nothing was changed.');
  } else {
    console.log(`\nCreated ${created} index(es)${dropped ? `, dropped ${dropped} stale one(s)` : ''}.`);
  }

  await mongoose.connection.close();
})().catch((e) => {
  console.error('Index sync failed:', e.message);
  process.exit(1);
});
