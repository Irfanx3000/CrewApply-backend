'use strict';

const { config } = require('../config');

let twilioClient = null;

/**
 * Returns an initialised Twilio client when credentials are configured,
 * or null for the dev console-log fallback.
 *
 * Lazy-initialised so the module can be required even when twilio is not
 * installed (dev environments that never set TWILIO_* vars).
 */
const getClient = () => {
  if (twilioClient) return twilioClient;

  const { accountSid, authToken } = config.twilio;
  if (!accountSid || !authToken) return null;

  try {
    // eslint-disable-next-line global-require
    const twilio = require('twilio');
    twilioClient = twilio(accountSid, authToken);
    return twilioClient;
  } catch {
    console.warn(
      '[SMS] Twilio credentials found but the twilio package is not installed. ' +
        'Run: npm install twilio\n' +
        '[SMS] Falling back to console output.'
    );
    return null;
  }
};

/**
 * Sends an SMS message.
 * Falls back to console logging when Twilio is not configured.
 *
 * @param {{ to: string, body: string }} options
 */
const sendSms = async ({ to, body }) => {
  const client = getClient();

  if (!client) {
    console.log('\n[SMS DEV] ─────────────────────────────────────────');
    console.log(`  To  : ${to}`);
    console.log(`  Body: ${body}`);
    console.log('────────────────────────────────────────────────────\n');
    return { success: true, dev: true };
  }

  await client.messages.create({
    from: config.twilio.phoneNumber,
    to,
    body,
  });

  return { success: true, dev: false };
};

/**
 * Sends an OTP SMS for a specific purpose.
 * The message text is determined by the purpose.
 *
 * @param {{ to: string, otp: string, purpose: string }} options
 */
const sendOtpSms = async ({ to, otp, purpose }) => {
  const templates = {
    mobile_verification: `Your CrewApply verification code is: ${otp}. Valid for 10 minutes. Do not share this code.`,
    password_reset: `Your CrewApply password reset OTP is: ${otp}. Valid for 10 minutes.`,
    phone_update: `Your CrewApply phone update code is: ${otp}. Valid for 10 minutes.`,
    two_factor: `Your CrewApply 2FA code is: ${otp}. Valid for 10 minutes.`,
  };

  return sendSms({
    to,
    body: templates[purpose] || `Your CrewApply OTP is: ${otp}. Valid for 10 minutes.`,
  });
};

module.exports = { sendSms, sendOtpSms };