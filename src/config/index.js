'use strict';

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  mongoUri: process.env.MONGODB_URI,

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    refreshExpiresInDays: parseInt(process.env.JWT_REFRESH_EXPIRES_IN_DAYS, 10) || 7,
  },

  email: {
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    from: process.env.EMAIL_FROM || 'CrewApply <noreply@crewapply.com>',
  },

  client: {
    url: process.env.CLIENT_URL || 'http://localhost:3000',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },

  // Test-only: when true, OTPs are printed to the server logs even in production
  // (so a deployment without Twilio — e.g. on Railway — can still be tested).
  // Leave OFF for a real production release.
  smsDebug: process.env.SMS_DEBUG === 'true',

  // Razorpay (payments). keyId is the ONLY value ever exposed to the client.
  // keySecret signs orders + client verification; webhookSecret verifies webhooks.
  // NOT added to validateEnv required[] — the app boots without them; payment
  // endpoints throw a clear error until configured (see razorpay.service.js).
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  },

  // Firebase Admin (push notifications). Service-account JSON is stored as a
  // base64-encoded env var (avoids committing a JSON file / multiline env
  // escaping issues). NOT in validateEnv's required[] — the app boots without
  // it; push sends become silent no-ops until configured (see push.service.js).
  firebase: {
    serviceAccountBase64: process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
  },

  security: {
    // 10 rounds (~60ms) is a secure, OWASP-accepted default and ~4x faster than
    // 12 (~260ms) — the dominant cost of register/login. Override via env if needed.
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 10,
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS, 10) || 5,
    lockDurationMinutes: parseInt(process.env.LOCK_DURATION_MINUTES, 10) || 30,
    emailVerificationExpiryHours: 24,
    passwordResetExpiryHours: 1,
  },

  rateLimit: {
    // Login + Google — tight, to resist password brute-forcing.
    auth: {
      windowMs: 15 * 60 * 1000,
      max: 10,
    },
    // Onboarding: register + send-otp + verify-mobile. Needs more headroom
    // (mistyped OTPs, resends, back/forward re-registration) and is already
    // protected per-phone by the OTP attempt limit + 60s cooldown. Kept on its
    // own bucket so onboarding retries never lock a user out of login.
    otp: {
      windowMs: 15 * 60 * 1000,
      max: 30,
    },
    passwordReset: {
      windowMs: 60 * 60 * 1000,
      max: 5,
    },
    // Create-order (payment initiation). Modest cap — a real user starts very few
    // checkouts. The webhook is intentionally NOT rate-limited (gateway retries).
    payment: {
      windowMs: 15 * 60 * 1000,
      max: 20,
    },
    // Shared across nearly every route (see app.js) — sized for a real
    // multi-screen app with background polling (e.g. the subscription
    // screen's price-refresh polling), not just a handful of manual requests.
    general: {
      windowMs: 15 * 60 * 1000,
      max: 300,
    },
  },

  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
      : ['http://localhost:3000'],
  },

  body: {
    limit: '10kb',
  },

  upload: {
    profilePhoto: {
      maxSizeMb: 2,
      allowedMimes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
      outputWidth: 400,
      outputHeight: 400,
      outputQuality: 85,
    },
    resume: {
      maxSizeMb: 5,
      allowedMimes: ['application/pdf'],
    },
    document: {
      maxSizeMb: 10,
      allowedMimes: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
    },
    certificate: {
      maxSizeMb: 10,
      maxFiles: 10,
      allowedMimes: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
    },
    visa: {
      maxSizeMb: 10,
      maxFiles: 10,
      allowedMimes: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
    },
  },

  get isProduction() {
    return this.env === 'production';
  },

  get isDevelopment() {
    return this.env === 'development';
  },
};

/**
 * Validates that all required environment variables are present.
 * Call this once at server startup — fail fast if config is incomplete.
 */
const validateEnv = () => {
  const required = [
    'MONGODB_URI',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Server startup aborted. Missing required environment variables: ${missing.join(', ')}`
    );
  }
};

module.exports = { config, validateEnv };
