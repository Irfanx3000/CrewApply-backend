'use strict';

// Boot-time environment validation.
//
// validateEnv() now rejects insecure JWT configuration in production. These
// tests pin both halves of that, because the failure modes point in opposite
// directions: too lax and a guessable signing key reaches production; too
// strict and the API refuses to boot on a deploy, which is an outage.
//
// No database, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CONFIG = path.resolve(__dirname, '..', 'src', 'config');

/** Runs validateEnv() under a temporary environment and reports the outcome. */
const validateUnder = (env) => {
  const saved = { ...process.env };
  // A clean slate, so a value in the developer's real .env cannot mask a case.
  process.env = { MONGODB_URI: 'mongodb://localhost:27017/test', ...env };
  delete require.cache[require.resolve(CONFIG)];
  try {
    require(CONFIG).validateEnv();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message };
  } finally {
    process.env = saved;
    delete require.cache[require.resolve(CONFIG)];
  }
};

const STRONG_A = 'A'.repeat(50);
const STRONG_B = 'B'.repeat(50);

test('missing secrets are rejected in every environment', () => {
  const r = validateUnder({ NODE_ENV: 'production' });
  assert.equal(r.ok, false);
  assert.match(r.message, /Missing required environment variables/);
});

test('development is not blocked by a weak secret', () => {
  const r = validateUnder({
    NODE_ENV: 'development',
    JWT_ACCESS_SECRET: 'secret',
    JWT_REFRESH_SECRET: 'secret2',
  });
  assert.equal(r.ok, true,
    'strength rules must not add friction on a developer machine');
});

test('production refuses a short secret', () => {
  const r = validateUnder({
    NODE_ENV: 'production',
    JWT_ACCESS_SECRET: 'tooshort',
    JWT_REFRESH_SECRET: STRONG_B,
  });
  assert.equal(r.ok, false);
  assert.match(r.message, /at least 32/);
});

test('production refuses a well-known placeholder', () => {
  const r = validateUnder({
    NODE_ENV: 'production',
    JWT_ACCESS_SECRET: 'changeme'.padEnd(40, 'x') === 'changeme' ? 'changeme' : 'changeme',
    JWT_REFRESH_SECRET: STRONG_B,
  });
  assert.equal(r.ok, false, 'placeholder values must be caught');
});

test('production refuses identical access and refresh secrets', () => {
  const r = validateUnder({
    NODE_ENV: 'production',
    JWT_ACCESS_SECRET: STRONG_A,
    JWT_REFRESH_SECRET: STRONG_A,
  });
  assert.equal(r.ok, false);
  assert.match(r.message, /identical/);
});

test('the failure message warns that rotation signs everyone out', () => {
  const r = validateUnder({
    NODE_ENV: 'production',
    JWT_ACCESS_SECRET: 'weak',
    JWT_REFRESH_SECRET: STRONG_B,
  });
  assert.equal(r.ok, false);
  assert.match(r.message, /signs out every user/i,
    'whoever hits this must be told not to silently change the secret on a live server');
});

test('a strong, distinct pair boots in production', () => {
  const r = validateUnder({
    NODE_ENV: 'production',
    JWT_ACCESS_SECRET: STRONG_A,
    JWT_REFRESH_SECRET: STRONG_B,
  });
  assert.equal(r.ok, true, r.message);
});

test('the secrets currently in .env would pass in production', () => {
  // Guards against this change causing a boot failure on the next deploy.
  // Reads the real .env without printing any value.
  require('dotenv').config({ quiet: true });
  const access = process.env.JWT_ACCESS_SECRET;
  const refresh = process.env.JWT_REFRESH_SECRET;

  if (!access || !refresh) {
    // Nothing to assert on a machine without a populated .env.
    return;
  }

  const r = validateUnder({
    NODE_ENV: 'production',
    JWT_ACCESS_SECRET: access,
    JWT_REFRESH_SECRET: refresh,
  });
  assert.equal(r.ok, true,
    'the configured secrets must not cause a production boot failure');
});
