'use strict';

const crypto = require('crypto');

/**
 * Generates a cryptographically secure random hex token.
 *
 * @param {number} [bytes=40] - Number of random bytes (results in bytes*2 hex chars).
 * @returns {string} Raw hex token to send to the client.
 */
const generateToken = (bytes = 40) => {
  return crypto.randomBytes(bytes).toString('hex');
};

/**
 * Hashes a token using SHA-256.
 * Only the hash is stored in the database — the raw token is sent to the client.
 *
 * @param {string} rawToken - The raw token string to hash.
 * @returns {string} SHA-256 hex digest.
 */
const hashToken = (rawToken) => {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
};

/**
 * Generates a token and its hash in one operation.
 *
 * @param {number} [bytes=40]
 * @returns {{ rawToken: string, hashedToken: string }}
 */
const generateTokenPair = (bytes = 40) => {
  const rawToken = generateToken(bytes);
  const hashedToken = hashToken(rawToken);
  return { rawToken, hashedToken };
};

/**
 * Performs a constant-time comparison of two strings to prevent timing attacks.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
const timingSafeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;

  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  return crypto.timingSafeEqual(bufA, bufB);
};

module.exports = { generateToken, hashToken, generateTokenPair, timingSafeEqual };
