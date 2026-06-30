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

  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS, 10) || 5,
    lockDurationMinutes: parseInt(process.env.LOCK_DURATION_MINUTES, 10) || 30,
    emailVerificationExpiryHours: 24,
    passwordResetExpiryHours: 1,
  },

  rateLimit: {
    auth: {
      windowMs: 15 * 60 * 1000,
      max: 10,
    },
    passwordReset: {
      windowMs: 60 * 60 * 1000,
      max: 5,
    },
    general: {
      windowMs: 15 * 60 * 1000,
      max: 100,
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
