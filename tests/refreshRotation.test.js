'use strict';

// Refresh-token rotation regression test.
//
// Rotation was made atomic. These tests pin BOTH sides of that change, because
// getting either wrong is severe in opposite directions:
//
//   1. Concurrent rotation of the same token must NOT be treated as theft.
//      (Before: both callers saw isRevoked:false, the loser hit reuse
//      detection, and every session on every device was deleted.)
//   2. Genuine reuse of an already-revoked token MUST still wipe the family.
//      (The security control the brief says to preserve. Narrowing the false
//      positive must not have narrowed the true positive.)
//
// Runs against an isolated throwaway database, dropped at the end.

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

require('dotenv').config({ quiet: true });

const TEST_DB = 'crewapply_hardening_test_auth';

const testUri = () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required to run these tests.');
  const [base, query] = uri.split('?');
  const withoutDb = base.replace(/\/[^/]*$/, '');
  return `${withoutDb}/${TEST_DB}${query ? `?${query}` : ''}`;
};

let RefreshToken;
let tokenService;
const userId = new mongoose.Types.ObjectId();

test.before(async () => {
  await mongoose.connect(testUri());
  RefreshToken = require('../src/models/refreshToken.model');
  tokenService = require('../src/services/token.service');
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

test('concurrent rotation of one token: exactly one wins, sessions survive', async () => {
  await RefreshToken.deleteMany({ userId });

  // Two sessions for this user — a phone and a tablet, say.
  const phoneToken = await tokenService.createRefreshToken(userId, {});
  await tokenService.createRefreshToken(userId, {});
  assert.equal(await RefreshToken.countDocuments({ userId }), 2, 'two live sessions');

  // The phone fires two refreshes at once with the SAME token — an app restart
  // racing a background push handler, which the client-side queue cannot cover.
  const doc1 = await tokenService.validateRefreshToken(phoneToken);
  const doc2 = await RefreshToken.findById(doc1._id); // second caller's stale read

  const results = await Promise.allSettled([
    tokenService.rotateRefreshToken(doc1, {}),
    tokenService.rotateRefreshToken(doc2, {}),
  ]);

  const won = results.filter((r) => r.status === 'fulfilled');
  const lost = results.filter((r) => r.status === 'rejected');

  assert.equal(won.length, 1, 'exactly one rotation may succeed');
  assert.equal(lost.length, 1, 'the other must be rejected, not allowed through');
  assert.equal(lost[0].reason.code, 'REFRESH_IN_PROGRESS',
    'the loser must be reported as a benign race, not as token theft');

  // The critical assertion: the tablet session is untouched.
  const remaining = await RefreshToken.countDocuments({ userId, isRevoked: false });
  assert.ok(remaining >= 2,
    `a concurrent refresh must not sign the user out elsewhere (live tokens: ${remaining})`);
});

test('genuine token reuse still wipes the whole family', async () => {
  await RefreshToken.deleteMany({ userId });

  const stolen = await tokenService.createRefreshToken(userId, {});
  await tokenService.createRefreshToken(userId, {});

  // Legitimate rotation — `stolen` is now revoked.
  const doc = await tokenService.validateRefreshToken(stolen);
  await tokenService.rotateRefreshToken(doc, {});

  // An attacker replays the old token some time later.
  await assert.rejects(
    () => tokenService.validateRefreshToken(stolen),
    (err) => err.code === 'TOKEN_REUSE_DETECTED',
    'replaying a revoked token must still be detected as reuse'
  );

  assert.equal(await RefreshToken.countDocuments({ userId }), 0,
    'reuse detection must still invalidate every token for the user');
});
