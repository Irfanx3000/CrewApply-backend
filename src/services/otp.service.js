'use strict';

const crypto = require('crypto');
const Otp = require('../models/otp.model');
const { hashToken, timingSafeEqual } = require('../utils/crypto.util');
const { OTP_PURPOSES, OTP_CONFIG } = require('../constants/otp');
const { AUTH_MESSAGES } = require('../constants/messages');
const { HTTP_STATUS } = require('../constants/httpStatus');
const AppError = require('../utils/AppError');

/**
 * Generates a cryptographically secure 6-digit numeric OTP.
 * Uses rejection sampling to ensure uniform distribution across 100000–999999.
 *
 * @returns {string} Zero-padded 6-digit string
 */
const generateRawOtp = () => {
  const min = 100000;
  const max = 999999;
  const range = max - min + 1; // 900000

  let value;
  do {
    // 3 bytes gives 0–16,777,215 — more than enough for 900,000 range
    const bytes = crypto.randomBytes(3);
    value = bytes.readUIntBE(0, 3);
  } while (value >= Math.floor(0xffffff / range) * range);

  return ((value % range) + min).toString();
};

/**
 * Creates a new OTP for the given phone + purpose.
 * Enforces the 60-second resend cooldown — throws if called too soon.
 * Deletes any previous OTP for the same phone + purpose before creating a new one.
 *
 * @param {string} phone - E.164 phone number
 * @param {string} purpose - One of OTP_PURPOSES values
 * @returns {Promise<string>} The raw (unhashed) OTP to send to the user
 */
const createOtp = async (phone, purpose) => {
  const existing = await Otp.findOne({ phone, purpose });

  if (existing) {
    const elapsedMs = Date.now() - existing.createdAt.getTime();
    const cooldownMs = OTP_CONFIG.RESEND_COOLDOWN_SECONDS * 1000;

    if (elapsedMs < cooldownMs) {
      const waitSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
      throw new AppError(
        `Please wait ${waitSeconds} second${waitSeconds === 1 ? '' : 's'} before requesting a new code.`,
        HTTP_STATUS.TOO_MANY_REQUESTS,
        'OTP_COOLDOWN'
      );
    }

    await Otp.deleteOne({ _id: existing._id });
  }

  const rawOtp = generateRawOtp();
  const otpHash = hashToken(rawOtp);
  const expiresAt = new Date(Date.now() + OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000);

  await Otp.create({ phone, otpHash, purpose, expiresAt });

  return rawOtp;
};

/**
 * Verifies a raw OTP against the stored hash for a given phone + purpose.
 * Increments attempt counter before comparing to prevent race-condition enumeration.
 * Deletes the OTP document on success (one-time use) or when max attempts is reached.
 *
 * @param {string} phone - E.164 phone number
 * @param {string} rawOtp - The 6-digit code entered by the user
 * @param {string} purpose - One of OTP_PURPOSES values
 * @returns {Promise<true>}
 * @throws {AppError} on invalid, expired, or exhausted OTP
 */
const verifyOtp = async (phone, rawOtp, purpose) => {
  const otpDoc = await Otp.findOne({ phone, purpose }).select('+otpHash');

  if (!otpDoc) {
    throw new AppError(AUTH_MESSAGES.OTP_NOT_FOUND, HTTP_STATUS.BAD_REQUEST, 'OTP_NOT_FOUND');
  }

  if (otpDoc.expiresAt < new Date()) {
    await Otp.deleteOne({ _id: otpDoc._id });
    throw new AppError(AUTH_MESSAGES.OTP_EXPIRED, HTTP_STATUS.BAD_REQUEST, 'OTP_EXPIRED');
  }

  if (otpDoc.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
    await Otp.deleteOne({ _id: otpDoc._id });
    throw new AppError(AUTH_MESSAGES.OTP_MAX_ATTEMPTS, HTTP_STATUS.TOO_MANY_REQUESTS, 'OTP_MAX_ATTEMPTS');
  }

  // Increment before comparing — prevents race-condition reuse of the last attempt
  otpDoc.attempts += 1;
  await otpDoc.save();

  const candidateHash = hashToken(rawOtp);
  const isValid = timingSafeEqual(candidateHash, otpDoc.otpHash);

  if (!isValid) {
    // If this wrong entry exhausted the allowance, burn the code and say so —
    // avoids the confusing "0 attempts remaining" on the final try.
    if (otpDoc.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
      await Otp.deleteOne({ _id: otpDoc._id });
      throw new AppError(AUTH_MESSAGES.OTP_MAX_ATTEMPTS, HTTP_STATUS.TOO_MANY_REQUESTS, 'OTP_MAX_ATTEMPTS');
    }
    const remaining = OTP_CONFIG.MAX_ATTEMPTS - otpDoc.attempts;
    throw new AppError(
      `${AUTH_MESSAGES.OTP_INVALID} ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
      HTTP_STATUS.BAD_REQUEST,
      'OTP_INVALID'
    );
  }

  // One-time use — delete after successful verification
  await Otp.deleteOne({ _id: otpDoc._id });
  return true;
};

/**
 * Removes any existing OTP for a phone + purpose (clears the resend cooldown).
 * Used when a user deliberately re-registers, so a fresh code can be issued.
 *
 * @param {string} phone - E.164 phone number
 * @param {string} purpose - One of OTP_PURPOSES values
 */
const clearOtp = async (phone, purpose) => {
  await Otp.deleteMany({ phone, purpose });
};

module.exports = { createOtp, verifyOtp, clearOtp };