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

// ── Per-section admin permissions ─────────────────────────────────────────────
// One entry per admin-panel sidebar section (matches CrewApply-admin's
// NAV_ITEMS keys, minus 'dashboard' — that's the universal landing page every
// admin sees regardless of scope, with no write actions of its own).
const PERMISSION_SECTIONS = Object.freeze([
  'jobs', 'categories', 'applications', 'users', 'subscriptions',
  'referrals', 'payments', 'consultancy', 'support', 'banners', 'analytics', 'settings',
]);

const sectionPermissionSchema = new mongoose.Schema(
  {
    read: { type: Boolean, default: false },
    write: { type: Boolean, default: false },
  },
  { _id: false }
);

const permissionsSchema = new mongoose.Schema(
  {
    jobs: { type: sectionPermissionSchema, default: undefined },
    categories: { type: sectionPermissionSchema, default: undefined },
    applications: { type: sectionPermissionSchema, default: undefined },
    users: { type: sectionPermissionSchema, default: undefined },
    subscriptions: { type: sectionPermissionSchema, default: undefined },
    referrals: { type: sectionPermissionSchema, default: undefined },
    payments: { type: sectionPermissionSchema, default: undefined },
    consultancy: { type: sectionPermissionSchema, default: undefined },
    support: { type: sectionPermissionSchema, default: undefined },
    banners: { type: sectionPermissionSchema, default: undefined },
    analytics: { type: sectionPermissionSchema, default: undefined },
    settings: { type: sectionPermissionSchema, default: undefined },
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

    // Grants admin-panel access on TOP of an existing seafarer/recruiter
    // account, without touching `role` (which still governs their mobile-app
    // identity/behavior) — lets one person keep full seafarer access AND log
    // into the admin panel with the same account. A brand-new admin invite
    // (no prior account) still just uses role: ROLES.ADMIN and never needs
    // this; see adminAccount.service.js.
    isAdmin: {
      type: Boolean,
      default: false,
    },

    // Per-section read/write scope for this admin (see permissionsSchema
    // above). ABSENT (no default here, deliberately) means full access to
    // every section — this is what grandfathers every admin that predates
    // this feature, and is the default for any invite that doesn't use the
    // scope picker. Only ever set on an admin whose invite explicitly chose
    // a restricted scope.
    permissions: {
      type: permissionsSchema,
    },

    // Staged permissions chosen at invite time, applied to `permissions`
    // once the invite is actually accepted (see adminAccount.service.js) —
    // mirrors how `isAdmin` itself only flips true on accept, not invite.
    // Never read for access control; select: false keeps it out of default
    // query projections.
    pendingPermissions: {
      type: permissionsSchema,
      select: false,
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
    // No `default` here, deliberately — same reasoning as referralCode below:
    // a sparse unique index only skips documents where the field is ABSENT,
    // not documents where it's explicitly null. `default: null` would stamp
    // an explicit null on every phone-less account (Google OAuth signups,
    // invited admins), and the second such account would collide on this
    // unique index. Leave it genuinely unset until the user actually has one.
    phone: {
      type: String,
      trim: true,
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

    // ── Referrals & wallet ───────────────────────────────────────────────────────
    // referralCode: this user's own shareable code (many friends can use it).
    // referredBy: set ONCE at registration, never overwritten — who referred
    // THIS account. walletBalance is denormalized from WalletTransaction the
    // same way subscriptionTier is denormalized from Subscription above: the
    // transaction collection is the source of truth, this is a fast-read cache.
    //
    // No `default` here, deliberately — a sparse unique index only skips
    // documents where the field is ABSENT, not documents where it's explicitly
    // null. Since most users never generate a code (it's an on-demand action,
    // see referral.service.js's generateCode()), a `default: null` would put
    // an explicit null on every such document and the second one ever created
    // would collide on this unique index.
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      index: true,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    walletBalance: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ── Account status ─────────────────────────────────────────────────────────
    isActive: {
      type: Boolean,
      default: true,
    },

    // Soft-delete (admin panel "Delete User") — reversible via restore, unlike
    // a real Mongo delete. Kept distinct from isActive so "blocked" (reversible
    // suspension, still listed) and "deleted" (hidden from the default list)
    // read as separate admin actions even though both currently block login.
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },

    // Admin's reason for the current block, shown to the user on the
    // "Account Blocked" screen — cleared automatically whenever setStatus
    // moves the account off 'blocked' (unblock/delete), so a stale reason
    // never survives a status change. See adminUser.service.js#setStatus.
    blockedReason: {
      type: String,
      trim: true,
      maxlength: 250,
      default: null,
    },

    // ── Saved jobs ──────────────────────────────────────────────────────────────
    // Bookmarked jobs, populated on read. select: false — never needed in
    // profile responses, only via the dedicated saved-jobs endpoints.
    savedJobs: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Job' }],
      default: [],
      select: false,
    },

    // ── Job category preferences ──────────────────────────────────────────────
    // Category *names*, not ObjectId refs — matches Job.category's own storage
    // (a plain String validated against the admin-manageable JobTaxonomy
    // collection at the request layer, not a fixed schema enum). Drives
    // notifyEligibleUsersForJob's category-match path (see notification.service.js).
    preferredCategories: {
      type: [String],
      default: [],
      select: false,
    },

    // How many days a notification stays visible to this user before the
    // read endpoints (notification.service.js) filter it out. The actual DB
    // TTL cleanup (notification.model.js) is a fixed 15-day ceiling shared by
    // everyone — this is the per-user "disappears sooner" preference layered
    // on top via a query-time filter, not real per-user deletion.
    notificationExpiryDays: {
      type: Number,
      enum: [5, 10, 15],
      default: 10,
      select: false,
    },

    // Only gates the FCM push itself (see push.service.js's sendToUser) —
    // the in-app Notification record is always created regardless, so
    // turning this off never hides anything from the Notifications screen,
    // it only silences the system pop-up/banner.
    pushNotificationsEnabled: {
      type: Boolean,
      default: true,
      select: false,
    },

    // ── Push notifications ─────────────────────────────────────────────────────
    // Array (not a single field) — a user may be logged in on multiple devices.
    // Internal plumbing, never needed in profile responses.
    deviceTokens: {
      type: [
        new mongoose.Schema(
          {
            token: { type: String, required: true },
            platform: { type: String, enum: ['ios', 'android'], required: true },
            createdAt: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: [],
      select: false,
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
// Admin universal search — phone stays regex-matched (see search.service.js),
// digits-only values aren't meaningfully text-indexable.
userSchema.index({ name: 'text', email: 'text' });

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
module.exports.PERMISSION_SECTIONS = PERMISSION_SECTIONS;