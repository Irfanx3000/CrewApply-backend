'use strict';

/**
 * Proves adminUser.service.js end-to-end against the real dev DB:
 *  1) listAdminUsers returns seafarer/recruiter accounts, excludes deleted by default.
 *  2) setStatus('blocked') flips isActive off, is reflected in status filter.
 *  3) A blocked user is rejected by auth.middleware's gate (isActive/isDeleted check).
 *  4) setStatus('deleted') hides the user from the default list but keeps their data;
 *     the 'deleted' status filter still finds them.
 *  5) setStatus('active') restores them back into the default list.
 *  6) Attempting to modify an admin account is rejected (CANNOT_MODIFY_NON_USER_ACCOUNT).
 *
 * Run: node src/scripts/testAdminUsers.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user.model');
const adminUserService = require('../services/adminUser.service');
const { ROLES } = require('../constants/roles');

const fakeReq = { ip: '127.0.0.1', get: () => 'test-script' };

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ DB connected\n');

  const email = 'adminusers.test@example.com';
  let user = await User.findOne({ email });
  if (user) await User.deleteOne({ _id: user._id });
  user = await User.create({
    name: 'Admin Users Test', email, password: 'Passw0rd!23',
    phone: '+919000000077', phoneVerified: true, isActive: true, role: ROLES.USER,
  });
  console.log('✓ created fresh test user\n');

  const results = [];
  const check = (label, ok, detail) => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`); };

  // 1) Listed by default, findable by search
  const listed = await adminUserService.listAdminUsers({ search: 'adminusers.test' });
  check('list: default view finds the new active user', listed.users.some((u) => String(u.id) === String(user._id)));
  check('list: presentAdminUser never leaks password/hashes', listed.users.every((u) => u.password === undefined && u.passwordResetTokenHash === undefined));

  // 2) Block
  const blocked = await adminUserService.setStatus(user._id, 'blocked', user._id, fakeReq);
  check('setStatus(blocked): status field flips', blocked.status === 'blocked');
  const listBlocked = await adminUserService.listAdminUsers({ status: 'blocked', search: 'adminusers.test' });
  check('list: status=blocked filter finds them', listBlocked.users.some((u) => String(u.id) === String(user._id)));
  const listActiveOnly = await adminUserService.listAdminUsers({ status: 'active', search: 'adminusers.test' });
  check('list: status=active filter no longer finds them', !listActiveOnly.users.some((u) => String(u.id) === String(user._id)));

  // 3) auth.middleware gate — simulate what authenticate() checks
  const reread = await User.findById(user._id);
  const wouldBeRejected = !reread.isActive || reread.isDeleted;
  check('auth gate: blocked user would be rejected (isActive=false)', wouldBeRejected);

  // 4) Delete — hidden from default list, kept in 'deleted' filter, data intact
  const deleted = await adminUserService.setStatus(user._id, 'deleted', user._id, fakeReq);
  check('setStatus(deleted): status field flips', deleted.status === 'deleted');
  const defaultList = await adminUserService.listAdminUsers({ search: 'adminusers.test' });
  check('list: default view no longer shows the deleted user', !defaultList.users.some((u) => String(u.id) === String(user._id)));
  const deletedList = await adminUserService.listAdminUsers({ status: 'deleted', search: 'adminusers.test' });
  check('list: status=deleted filter still finds them', deletedList.users.some((u) => String(u.id) === String(user._id)));
  const stillExists = await User.findById(user._id).lean();
  check('delete is soft — the User document still exists in the DB', !!stillExists);

  // 5) Restore
  const restored = await adminUserService.setStatus(user._id, 'active', user._id, fakeReq);
  check('setStatus(active): restores from deleted', restored.status === 'active');
  const listAfterRestore = await adminUserService.listAdminUsers({ search: 'adminusers.test' });
  check('list: default view shows the restored user again', listAfterRestore.users.some((u) => String(u.id) === String(user._id)));

  // 6) Guard against modifying non-user/employer accounts (e.g. an admin)
  let adminGuardCode = null;
  const anyAdmin = await User.findOne({ role: ROLES.ADMIN });
  if (anyAdmin) {
    try {
      await adminUserService.setStatus(anyAdmin._id, 'blocked', user._id, fakeReq);
    } catch (e) { adminGuardCode = e.code; }
    check('guard: cannot block an admin account via this service', adminGuardCode === 'CANNOT_MODIFY_NON_USER_ACCOUNT', adminGuardCode);
  } else {
    console.log('⚠️  no admin account found in DB — skipping guard check');
  }

  const pass = results.every(Boolean);
  console.log('\n' + (pass ? '✅ PASS — admin user management works end-to-end' : '❌ FAIL — see above'));

  await User.deleteOne({ _id: user._id });
  console.log('✓ cleaned up test user');

  await mongoose.disconnect();
  process.exit(pass ? 0 : 1);
})().catch(async (e) => {
  console.error('ERROR:', e);
  await mongoose.disconnect();
  process.exit(1);
});
