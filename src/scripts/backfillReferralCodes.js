'use strict';

// Generates a referralCode for any existing user that doesn't have one yet
// (accounts created before this feature shipped). Safe to re-run — only
// touches users with referralCode: null.
//
// Run: node src/scripts/backfillReferralCodes.js

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user.model');
const referralService = require('../services/referral.service');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ DB connected\n');

  const users = await User.find({ referralCode: null }).select('_id name');
  console.log(`Found ${users.length} user(s) without a referral code.`);

  let updated = 0;
  for (const user of users) {
    const code = await referralService.generateUniqueReferralCode();
    await User.updateOne({ _id: user._id }, { $set: { referralCode: code } });
    updated += 1;
  }

  console.log(`\n✓ Backfilled ${updated} referral code(s).`);
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error('ERROR:', e);
  await mongoose.disconnect();
  process.exit(1);
});
