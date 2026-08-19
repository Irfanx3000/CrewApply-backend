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

  // This API's own public base URL — used to build absolute links to assets
  // it serves itself (e.g. the email logo, see src/emails/emailLayout.js).
  // In production this must be the real reachable URL (https://api.crewapply.com)
  // or embedded images in transactional emails won't render for recipients.
  publicUrl: process.env.PUBLIC_URL || `http://localhost:${parseInt(process.env.PORT, 10) || 5000}`,

  // The CrewApply-admin web app — a separate deployment from the mobile
  // app's own client.url above. Used to link the admin-invite email to the
  // Accept Invite screen there.
  adminClient: {
    url: process.env.ADMIN_CLIENT_URL || 'http://localhost:5173',
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

  // Resend (job-alert emails for Premium/Elite subscribers — Crew Start is
  // app/push-only, see notification.service.js#notifyEligibleUsersForJob).
  // NOT in validateEnv's required[] — the app boots without it; email sends
  // become silent no-ops until configured (see resend.service.js).
  resend: {
    apiKey: process.env.RESEND_API_KEY,
    fromEmail: process.env.RESEND_FROM_EMAIL || 'CrewApply <alerts@crewapply.com>',
  },

  security: {
    // 10 rounds (~60ms) is a secure, OWASP-accepted default and ~4x faster than
    // 12 (~260ms) — the dominant cost of register/login. Override via env if needed.
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 10,
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS, 10) || 5,
    lockDurationMinutes: parseInt(process.env.LOCK_DURATION_MINUTES, 10) || 30,
    // Whether a failed login tells the user how many attempts remain before
    // the 30-minute lockout. ON by default: being locked out for half an hour
    // with no prior warning is a genuinely bad experience for the far more
    // common case (a real user mistyping their own password).
    //
    // TRADE-OFF, read before changing: the countdown is only returned for an
    // account that actually exists, so it lets someone probe whether an email
    // or phone number is registered — the one thing every other response on
    // this endpoint is careful not to reveal. The exposure is bounded by
    // authLimiter (10 attempts / 15 min / IP) and by the lockout itself, and
    // a 423 lockout already implies the account exists. Set
    // REVEAL_REMAINING_LOGIN_ATTEMPTS=false to trade the warning back for
    // strict enumeration resistance.
    revealRemainingAttempts: process.env.REVEAL_REMAINING_LOGIN_ATTEMPTS !== 'false',
    emailVerificationExpiryHours: 24,
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
    // Bumped from 300: a burst of stacked navigation screens each fetching
    // on mount, plus notification polling and silent token refresh, could
    // exhaust 300/15min under legitimate fast multi-screen usage alone —
    // see the Career Profile duplicate-fetch fix in CareerProfileContext.jsx
    // for the actual root-cause fix; this is just extra headroom on top.
    general: {
      windowMs: 15 * 60 * 1000,
      max: 600,
    },
    // Universal search fans out into several parallel Mongo queries per
    // request — tighter, shorter-window cap than generalLimiter alone.
    search: {
      windowMs: 60 * 1000,
      max: 30,
    },
    // Unauthenticated support submissions (POST /support/public) — no
    // per-account throttle to fall back on since there's no session, so
    // this stays tight relative to the authenticated support endpoint.
    supportPublic: {
      windowMs: 15 * 60 * 1000,
      max: 5,
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
// A JWT signing secret shorter than this is brute-forceable offline: an
// attacker only needs one token this server has ever issued, and can then mint
// a valid access token for ANY user id, including an admin. 32 characters is
// the widely-used floor for HS256 (it matches the 256-bit output the algorithm
// assumes).
const MIN_JWT_SECRET_LENGTH = 32;

// Placeholder values that show up in tutorials, .env.example files and
// copy-pasted configs. Any of these in production means the secret is
// effectively public.
const WEAK_SECRET_VALUES = new Set([
  'secret', 'jwtsecret', 'jwt_secret', 'changeme', 'change_me', 'password',
  'mysecret', 'supersecret', 'your-secret-key', 'your_jwt_secret', 'test',
  'development', 'dev', 'accesssecret', 'refreshsecret',
]);

/**
 * Boot-time environment validation.
 *
 * Presence is enforced everywhere. Secret STRENGTH is enforced only in
 * production, and deliberately so: failing a developer's machine over a short
 * throwaway secret is friction with no security value, whereas booting
 * production with a guessable signing key is a total compromise of every
 * session.
 *
 * IMPORTANT -- this never rotates anything. If a live secret turns out to be
 * weak, the correct response is a planned rotation during a maintenance window,
 * because changing either secret invalidates every access token AND every
 * refresh token in circulation: every user on every device is signed out at
 * once. That has to be a scheduled decision, never a side effect of a deploy.
 * The error below says exactly that, so whoever hits it is not tempted to
 * "just change it" on a live system.
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

  if (process.env.NODE_ENV !== 'production') return;

  const problems = [];
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    const value = process.env[key];
    if (value.length < MIN_JWT_SECRET_LENGTH) {
      problems.push(`${key} is ${value.length} characters; at least ${MIN_JWT_SECRET_LENGTH} are required.`);
    }
    if (WEAK_SECRET_VALUES.has(value.trim().toLowerCase())) {
      problems.push(`${key} is a well-known placeholder value.`);
    }
  }

  // Reusing one secret for both token types means a refresh token can be
  // presented as an access token and vice versa; only the `type` claim would
  // separate them, which is a single check away from being a full bypass.
  if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
    problems.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are identical; they must differ.');
  }

  if (problems.length > 0) {
    const lines = [
      'Server startup aborted -- insecure JWT configuration:',
      ...problems.map((p) => `  - ${p}`),
      '',
      'Generate strong values with:',
      '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
      '',
      'NOTE: rotating either secret signs out every user on every device, because',
      'it invalidates every access token AND every refresh token in circulation.',
      'Schedule it as a maintenance action -- do not change it silently on a live server.',
    ];
    throw new Error(lines.join('\n'));
  }
};

module.exports = { config, validateEnv };
