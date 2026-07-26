'use strict';

const OTP_PURPOSES = Object.freeze({
  MOBILE_VERIFICATION: 'mobile_verification',
  PASSWORD_RESET: 'password_reset',
  PHONE_UPDATE: 'phone_update',
  TWO_FACTOR: 'two_factor',
  // Scoped separately from MOBILE_VERIFICATION so a mobile-app registration
  // code and an admin-invite code can never validate against each other,
  // even if (implausibly) issued to the same email at the same time.
  ADMIN_INVITE: 'admin_invite',
});

const OTP_CONFIG = Object.freeze({
  LENGTH: 6,
  EXPIRY_MINUTES: 10,
  MAX_ATTEMPTS: 5,
  RESEND_COOLDOWN_SECONDS: 60,
});

module.exports = { OTP_PURPOSES, OTP_CONFIG };
