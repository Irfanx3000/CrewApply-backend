'use strict';

const User = require('../models/user.model');
const auditService = require('./audit.service');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');
const { AUDIT_EVENTS } = require('../constants/audit');
const { ROLES } = require('../constants/roles');
const { escapeRegex } = require('../utils/searchUtil');

// Admin-only management of app users (seafarers/recruiters who onboarded via
// the mobile app) — never admin accounts, guarded in every write below.

const VALID_STATUSES = Object.freeze(['active', 'blocked', 'deleted']);

const ctxOf = (req) => ({
  ipAddress: req?.ip || null,
  userAgent: req?.get?.('user-agent') || null,
});

const parsePagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
};

// isActive/isDeleted -> the single tri-state status the admin UI deals with.
const statusOf = (user) => (user.isDeleted ? 'deleted' : user.isActive ? 'active' : 'blocked');

/**
 * Reshapes a User doc into the admin-facing DTO — an explicit allowlist so a
 * newly-added sensitive field (password, token hashes, OTP state, lockUntil,
 * deviceTokens, etc.) can never leak here just by existing on the schema.
 */
const presentAdminUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  avatar: user.avatar,
  role: user.role,
  status: statusOf(user),
  onboardingCompleted: user.onboardingCompleted,
  emailVerified: user.emailVerified,
  phoneVerified: user.phoneVerified,
  subscriptionTier: user.subscriptionTier,
  subscriptionStatus: user.subscriptionStatus,
  subscriptionExpiresAt: user.subscriptionExpiresAt,
  maritimeProfile: user.maritimeProfile
    ? {
        rank: user.maritimeProfile.rank,
        department: user.maritimeProfile.department,
        currentVessel: user.maritimeProfile.currentVessel,
        seaExperienceYears: user.maritimeProfile.seaExperienceYears,
      }
    : null,
  joinedAt: user.createdAt,
  lastLoginAt: user.lastLoginAt,
  deletedAt: user.deletedAt,
  blockedReason: user.blockedReason,
});

// Lists seafarer/recruiter accounts only — never admins, this panel doesn't
// manage other admins.
const listAdminUsers = async (query) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = { role: { $in: [ROLES.USER, ROLES.EMPLOYER] } };

  if (query.role) filter.role = query.role;

  if (query.status === 'deleted') {
    filter.isDeleted = true;
  } else if (query.status === 'active') {
    filter.isDeleted = { $ne: true };
    filter.isActive = true;
  } else if (query.status === 'blocked') {
    filter.isDeleted = { $ne: true };
    filter.isActive = false;
  } else {
    // Default view: everyone except deleted accounts (matches how a
    // "Users" list should read — deleted is an explicit, opt-in tab).
    filter.isDeleted = { $ne: true };
  }

  if (query.subscriptionTier) filter.subscriptionTier = query.subscriptionTier;

  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search.trim()), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);

  return { users: users.map(presentAdminUser), page, limit, total };
};

const getAdminUserById = async (id) => {
  const user = await User.findOne({ _id: id, role: { $in: [ROLES.USER, ROLES.EMPLOYER] } }).lean();
  return user ? presentAdminUser(user) : null;
};

// One endpoint drives Block / Unblock / Delete / Restore — they're really
// just the 3 states of the same status field, not 4 independent actions.
const setStatus = async (id, status, reason, adminId, req) => {
  if (!VALID_STATUSES.includes(status)) {
    throw new AppError(AUTH_MESSAGES.INVALID_USER_STATUS, HTTP_STATUS.BAD_REQUEST, 'INVALID_USER_STATUS');
  }

  const user = await User.findById(id);
  if (!user) {
    throw new AppError(AUTH_MESSAGES.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }
  if (![ROLES.USER, ROLES.EMPLOYER].includes(user.role)) {
    throw new AppError(AUTH_MESSAGES.CANNOT_MODIFY_NON_USER_ACCOUNT, HTTP_STATUS.FORBIDDEN, 'CANNOT_MODIFY_NON_USER_ACCOUNT');
  }

  user.isActive = status === 'active';
  user.isDeleted = status === 'deleted';
  user.deletedAt = status === 'deleted' ? new Date() : null;
  user.blockedReason = status === 'blocked' ? (reason || null) : null;
  // Blocking/deleting must clear device tokens HERE — auth.middleware.js
  // rejects every request from a blocked/deleted account (even with an
  // otherwise-valid JWT), so the mobile app can never successfully call its
  // own deregister endpoint once this happens. Without this, the device
  // keeps receiving pushes for an account the user can no longer even open
  // the app as, and the token sits there until someone else's login on that
  // same device reclaims it (see notification.service.js#registerDeviceToken).
  if (status !== 'active') {
    user.deviceTokens = [];
  }
  await user.save();

  auditService
    .log({ event: AUDIT_EVENTS.USER_STATUS_CHANGED, userId: adminId, ...ctxOf(req), metadata: { targetUserId: user._id, status } })
    .catch(() => {});

  return presentAdminUser(user.toObject());
};

module.exports = { listAdminUsers, getAdminUserById, setStatus, VALID_STATUSES, statusOf };
