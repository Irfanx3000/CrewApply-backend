'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { config } = require('../config');
const { ROLES, ALL_ROLES } = require('../constants/roles');

// ── Maritime profile sub-document ─────────────────────────────────────────────
const maritimeProfileSchema = new mongoose.Schema(
  {
    // Step 5 onboarding fields
    department:          { type: String, trim: true, default: null },
    rank:                { type: String, trim: true, default: null },
    designation:         { type: String, trim: true, default: null },
    experienceStartDate: { type: Date,   default: null },
    experienceEndDate:   { type: Date,   default: null },

    // Extended maritime information
    certificatesSummary: { type: String, trim: true, default: null },
    currentVessel:       { type: String, trim: true, default: null },
    preferredVessel:     { type: String, trim: true, default: null },
    preferredRank:       { type: String, trim: true, default: null },
    seaExperienceYears:  { type: Number, default: null },
    licenseNumbers:      { type: String, trim: true, default: null },
    medicalExpiry:       { type: Date,   default: null },
    passportExpiry:      { type: Date,   default: null },
    cdcNumber:           { type: String, trim: true, default: null },
    availabilityDate:    { type: Date,   default: null },
  },
  { _id: false }
);

// ── Main schema ───────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema(
  {
    // ── Core identity ──────────────────────────────────────────────────────────
    name: {
      type: String,
      required: [true, 'Name is required.'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters.'],
      maxlength: [50, 'Name must not exceed 50 characters.'],
    },

    email: {
      type: String,
      required: [true, 'Email is required.'],
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      minlength: [8, 'Password must be at least 8 characters.'],
      select: false,
    },

    role: {
      type: String,
      enum: { values: ALL_ROLES, message: `Invalid role. Must be one of: ${ALL_ROLES.join(', ')}.` },
      default: ROLES.USER,
    },

    avatar: {
      type: String,
      default: null,
    },

    // ── OAuth ──────────────────────────────────────────────────────────────────
    googleId: {
      type: String,
      default: null,
      index: { sparse: true },
    },

    // ── Phone ──────────────────────────────────────────────────────────────────
    phone: {
      type: String,
      trim: true,
      default: null,
    },

    phoneVerified: {
      type: Boolean,
      default: false,
    },

    // ── Personal information ───────────────────────────────────────────────────
    dateOfBirth: {
      type: Date,
      default: null,
    },

    gender: {
      type: String,
      enum: {
        values: ['Male', 'Female', 'Others'],
        message: 'Gender must be Male, Female, or Others.',
      },
      default: null,
    },

    nationality: {
      type: String,
      trim: true,
      default: null,
    },

    country: {
      type: String,
      trim: true,
      default: null,
    },

    state: {
      type: String,
      trim: true,
      default: null,
    },

    city: {
      type: String,
      trim: true,
      default: null,
    },

    maritalStatus: {
      type: String,
      enum: {
        values: ['Single', 'Married', 'Divorced', 'Widowed'],
        message: 'Invalid marital status.',
      },
      default: null,
    },

    alternatePhone: {
      type: String,
      trim: true,
      default: null,
    },

    currentLocation: {
      type: String,
      trim: true,
      default: null,
    },

    // ── Email verification ─────────────────────────────────────────────────────
    emailVerified: {
      type: Boolean,
      default: false,
    },

    emailVerificationTokenHash: {
      type: String,
      default: null,
      select: false,
    },

    emailVerificationTokenExpiry: {
      type: Date,
      default: null,
      select: false,
    },

    // ── Password reset ─────────────────────────────────────────────────────────
    passwordResetTokenHash: {
      type: String,
      default: null,
      select: false,
    },

    passwordResetTokenExpiry: {
      type: Date,
      default: null,
      select: false,
    },

    // ── Account security ───────────────────────────────────────────────────────
    loginAttempts: {
      type: Number,
      default: 0,
      select: false,
    },

    lockUntil: {
      type: Date,
      default: null,
      select: false,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    // ── Onboarding ─────────────────────────────────────────────────────────────
    onboardingCompleted: {
      type: Boolean,
      default: false,
    },

    maritimeProfile: {
      type: maritimeProfileSchema,
      default: null,
    },

    // ── Subscription (cached entitlement) ───────────────────────────────────────
    // Denormalized from the Subscription collection so per-request gating is a
    // zero-extra-query check on req.user (authenticate already loads the user).
    // The Subscription/Payment collections remain the source of truth; these are
    // written atomically on activation/expiry.
    subscriptionTier: {
      type: String,
      enum: { values: ['start', 'premium', 'elite'], message: 'Invalid subscription tier.' },
      default: null,
    },
    subscriptionStatus: {
      type: String,
      enum: { values: ['active', 'expired', 'cancelled'], message: 'Invalid subscription status.' },
      default: null,
    },
    subscriptionExpiresAt: {
      type: Date,
      default: null,
    },

    // ── Account status ─────────────────────────────────────────────────────────
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
userSchema.index({ email: 1, isActive: 1 });
// Sparse: allows multiple null values; unique: one account per verified phone
userSchema.index({ phone: 1 }, { unique: true, sparse: true });

// ── Virtuals ──────────────────────────────────────────────────────────────────

userSchema.virtual('isLocked').get(function () {
  return this.lockUntil != null && this.lockUntil > Date.now();
});

// profileCompletionScore is no longer a virtual — it is computed in the
// document service using User data + Document collection queries and returned
// as part of GET /user/profile.

// ── Hooks ──────────────────────────────────────────────────────────────────────

userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  this.password = await bcrypt.hash(this.password, config.security.bcryptRounds);
});

// ── Instance Methods ───────────────────────────────────────────────────────────

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.handleFailedLogin = async function () {
  const lockExpired = this.lockUntil && this.lockUntil < Date.now();

  if (lockExpired) {
    this.loginAttempts = 1;
    this.lockUntil = null;
  } else {
    this.loginAttempts += 1;

    const { maxLoginAttempts, lockDurationMinutes } = config.security;

    if (this.loginAttempts >= maxLoginAttempts) {
      this.lockUntil = new Date(Date.now() + lockDurationMinutes * 60 * 1000);
    }
  }

  await this.save({ validateBeforeSave: false });
};

userSchema.methods.resetLoginAttempts = async function () {
  this.loginAttempts = 0;
  this.lockUntil = null;
  this.lastLoginAt = new Date();
  await this.save({ validateBeforeSave: false });
};

module.exports = mongoose.model('User', userSchema);