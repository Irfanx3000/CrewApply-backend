'use strict';

// Create (or reset) a local super-admin account for testing the Admin Panel
// against real APIs. Re-runnable (upserts by email, always resets password).
//
//   node src/scripts/seedAdminUser.js

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user.model');
const { ROLES } = require('../constants/roles');

const EMAIL = 'admin@crewapply.local';
const PASSWORD = 'Admin@12345';

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  let user = await User.findOne({ email: EMAIL }).select('+password');

  if (!user) {
    user = new User({
      name: 'Super Admin',
      email: EMAIL,
      password: PASSWORD,
      role: ROLES.ADMIN,
      emailVerified: true,
      isActive: true,
      onboardingCompleted: true,
    });
  } else {
    user.password = PASSWORD;
    user.role = ROLES.ADMIN;
    user.isActive = true;
  }

  await user.save();

  console.log(`Admin user ready: ${EMAIL} / ${PASSWORD}`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error('Seed failed:', e.message);
  process.exit(1);
});
