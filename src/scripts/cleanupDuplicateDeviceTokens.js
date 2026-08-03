'use strict';

// One-time cleanup for data that predates the device-token-reclaim fix (see
// notification.service.js#registerDeviceToken). That fix only cleans up a
// token going FORWARD — the moment someone logs in and re-registers it. Any
// device that was already attached to more than one account before the fix
// shipped stays that way until this runs (or until each of those accounts
// happens to log in again naturally). This script finds every device token
// currently attached to more than one user and keeps it only on whichever
// account registered it most recently, removing it from every older owner.
//
// Safe to re-run — a no-op once the data is clean.
//
// Usage: node src/scripts/cleanupDuplicateDeviceTokens.js

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user.model');

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected. Scanning for device tokens shared across multiple accounts...\n');

  const users = await User.find({ 'deviceTokens.0': { $exists: true } }).select('+deviceTokens name email');

  // token -> [{ userId, name, email, createdAt }]
  const tokenOwners = new Map();
  for (const user of users) {
    for (const entry of user.deviceTokens) {
      const list = tokenOwners.get(entry.token) || [];
      list.push({
        userId: user._id,
        name: user.name,
        email: user.email,
        createdAt: entry.createdAt || new Date(0),
      });
      tokenOwners.set(entry.token, list);
    }
  }

  const duplicated = [...tokenOwners.entries()].filter(([, owners]) => owners.length > 1);

  if (duplicated.length === 0) {
    console.log('No shared device tokens found. Nothing to clean up.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${duplicated.length} token(s) shared across multiple accounts:\n`);

  let totalRemoved = 0;
  for (const [token, owners] of duplicated) {
    owners.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const [keep, ...remove] = owners;

    console.log(`Token ${token.slice(0, 16)}...`);
    console.log(`  keeping:  ${keep.name} <${keep.email}> (registered ${new Date(keep.createdAt).toISOString()})`);
    remove.forEach((r) => {
      console.log(`  removing: ${r.name} <${r.email}> (registered ${new Date(r.createdAt).toISOString()})`);
    });
    console.log('');

    await User.updateMany(
      { _id: { $in: remove.map((r) => r.userId) } },
      { $pull: { deviceTokens: { token } } }
    );
    totalRemoved += remove.length;
  }

  console.log(`Done. Removed ${totalRemoved} stale token registration(s) across ${duplicated.length} token(s).`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('Cleanup script failed:', err);
  process.exit(1);
});
