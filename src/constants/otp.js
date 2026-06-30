'use strict';

const OTP_PURPOSES = Object.freeze({
  MOBILE_VERIFICATION: 'mobile_verification',
  PASSWORD_RESET: 'password_reset',
  PHONE_UPDATE: 'phone_update',
  TWO_FACTOR: 'two_factor',
});

const OTP_CONFIG = Object.freeze({
  LENGTH: 6,
  EXPIRY_MINUTES: 10,
  MAX_ATTEMPTS: 5,
  RESEND_COOLDOWN_SECONDS: 60,
});

module.exports = { OTP_PURPOSES, OTP_CONFIG };
