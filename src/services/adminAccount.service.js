'use strict';

const User = require('../models/user.model');
const { ROLES } = require('../constants/roles');
const { OTP_PURPOSES } = require('../constants/otp');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');
const { AUDIT_EVENTS } = require('../constants/audit');
const { createOtp, verifyOtp } = require('./otp.service');
const { sendAdminInviteEmail } = require('./email.service');
const { signAccessToken, createRefreshToken, revokeAllRefreshTokens } = require('./token.service');
const { validateStrength } = require('./password.service');
const auditService = require('./audit.service');

// Manages fellow ADMIN accounts — deliberately separate from
// adminUser.service.js, which explicitly only ever lists/manages
// seafarer/recruiter accounts and refuses to touch admins. There is no
// public "become an admin" signup; the only way an admin account is ever
// created is another admin inviting one by email here.

const ctxOf = (req) => ({
  ipAddress: req?.ip || null,
  userAgent: req?.get?.('user-agent') || null,
});

// A promoted (isAdmin: true) user only ever appears in listAdmins() once
// they've actually accepted (and disappears again the moment they're
// revoked, since neither role nor isAdmin match the list query anymore) —
// so any such row is definitionally 'active'. The classic role: ROLES.ADMIN
// stub is the only case with two isActive: false meanings to disambiguate:
// never-accepted (emailVerified: false) vs. accepted-then-revoked
// (emailVerified: true, set once at acceptAdminInvite and never cleared).
const presentAdmin = (user) => {
  let status = 'active';
  if (user.role === ROLES.ADMIN && !user.isActive) {
    status = user.emailVerified ? 'revoked' : 'pending';
  }

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    status,
    invitedAt: user.createdAt,
    // null = full access (see user.model.js's `permissions` field comment) —
    // the Settings > Permissions tab treats this as its own sentinel.
    permissions: user.permissions ?? null,
  };
};

// ── Admin-only: list + invite ─────────────────────────────────────────────────

const listAdmins = async () => {
  const admins = await User.find({ $or: [{ role: ROLES.ADMIN }, { isAdmin: true }] })
    .sort({ createdAt: -1 })
    .lean();
  return admins.map(presentAdmin);
};

const inviteAdmin = async ({ email, confirm, permissions }, invitedByAdminId, req) => {
  const existing = await User.findOne({ email });
  let isPromotion = false;

  if (existing) {
    if (existing.role === ROLES.ADMIN) {
      if (existing.isActive) {
        throw new AppError(AUTH_MESSAGES.ADMIN_ALREADY_ACTIVE, HTTP_STATUS.CONFLICT, 'ADMIN_ALREADY_ACTIVE');
      }
      // Existing pending invite for this email — treat as a resend rather
      // than erroring, so an admin can re-invite someone whose first code
      // expired. Refresh the staged scope too, in case it changed since the
      // first invite attempt.
      existing.pendingPermissions = permissions ?? undefined;
      await existing.save({ validateBeforeSave: false });
    } else if (existing.isAdmin) {
      throw new AppError(AUTH_MESSAGES.USER_ALREADY_ADMIN, HTTP_STATUS.CONFLICT, 'ALREADY_ADMIN');
    } else {
      // This email belongs to an existing seafarer/recruiter account —
      // granting admin access here promotes it (adds admin-panel access on
      // top of their existing account) rather than creating a separate one.
      // That's a meaningful privilege change on somebody else's account, so
      // require the inviting admin to see who it is and explicitly confirm
      // before an OTP goes out.
      isPromotion = true;
      if (!confirm) {
        return {
          requiresConfirmation: true,
          existingUser: { name: existing.name, email: existing.email, role: existing.role, joinedAt: existing.createdAt },
        };
      }
      // confirm === true: fall through and send the OTP below. Deliberately
      // not touching `isAdmin`/`permissions` yet — those only flip once they
      // actually verify the OTP in acceptAdminInvite, so a never-accepted
      // promotion invite leaves their real access untouched. Staging the
      // chosen scope in `pendingPermissions` right now is harmless — it
      // grants nothing by itself.
      existing.pendingPermissions = permissions ?? undefined;
      await existing.save({ validateBeforeSave: false });
    }
  } else {
    // Placeholder name — the invited admin sets their real name when they
    // accept the invite. `password` is deliberately left unset (the User
    // schema doesn't require one, same as a Google-OAuth-created account)
    // until acceptAdminInvite completes. Safe to stage `pendingPermissions`
    // directly here too — `isActive: false` blocks login either way.
    await User.create({
      name: email.split('@')[0],
      email,
      role: ROLES.ADMIN,
      isActive: false,
      emailVerified: false,
      pendingPermissions: permissions ?? undefined,
    });
  }

  const rawOtp = await createOtp(email, OTP_PURPOSES.ADMIN_INVITE);
  sendAdminInviteEmail({ to: email, otp: rawOtp }).catch((err) => {
    console.error('adminAccountService.inviteAdmin: invite email send failed:', err.message);
  });

  await auditService.log({
    event: AUDIT_EVENTS.ADMIN_INVITED,
    userId: invitedByAdminId,
    ...ctxOf(req),
    metadata: { email, promotion: isPromotion },
  });

  return { email };
};

// ── Public: accept invite ─────────────────────────────────────────────────────

const acceptAdminInvite = async ({ email, otp, name, password }, req) => {
  validateStrength(password);

  // A fresh, admin-only stub (no prior account) — the classic invite path.
  // .select('+pendingPermissions') — excluded by default (select: false),
  // needed here to actually apply the staged scope below.
  let user = await User.findOne({ email, role: ROLES.ADMIN, isActive: false }).select('+pendingPermissions');
  let isPromotion = false;

  if (!user) {
    // Otherwise, this may be an existing seafarer/recruiter account
    // accepting a promotion invite (see inviteAdmin) — there's no DB-side
    // "pending" marker for that case, so a valid OTP for this email/purpose
    // is itself the proof the invite is legitimate and pending.
    user = await User.findOne({ email, isAdmin: { $ne: true } }).select('+pendingPermissions');
    isPromotion = !!user;
  }

  if (!user) {
    throw new AppError(AUTH_MESSAGES.ADMIN_INVITE_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'INVITE_NOT_FOUND');
  }

  await verifyOtp(email, otp, OTP_PURPOSES.ADMIN_INVITE);

  // Setting name/password here even for a promotion is deliberate, not an
  // oversight — the invited person is asked to (re)confirm both as part of
  // accepting, and since it's one shared account, the password they set here
  // becomes their login for both the mobile app and the admin panel.
  user.name = name;
  user.password = password;
  user.isActive = true;
  user.emailVerified = true;
  if (isPromotion) user.isAdmin = true;
  // Promote the staged scope chosen at invite time — unified for both the
  // stub and promotion paths, one mechanism instead of two. Absent
  // pendingPermissions (nobody used the scope picker) correctly leaves
  // `permissions` unset too, i.e. full access.
  user.permissions = user.pendingPermissions;
  user.pendingPermissions = undefined;
  await user.save();

  const context = ctxOf(req);
  const accessToken = signAccessToken(user);
  const refreshToken = await createRefreshToken(user._id, context);

  await auditService.log({ event: AUDIT_EVENTS.ADMIN_INVITE_ACCEPTED, userId: user._id, ...context });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isAdmin: user.isAdmin,
      permissions: user.permissions ?? null,
    },
  };
};

// ── Admin-only: revoke ─────────────────────────────────────────────────────────

const revokeAdmin = async (id, revokingAdminId, req) => {
  if (id === revokingAdminId.toString()) {
    throw new AppError(AUTH_MESSAGES.CANNOT_REVOKE_SELF, HTTP_STATUS.BAD_REQUEST, 'CANNOT_REVOKE_SELF');
  }

  const user = await User.findById(id);
  if (!user) {
    throw new AppError(AUTH_MESSAGES.ADMIN_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'ADMIN_NOT_FOUND');
  }

  if (user.role === ROLES.ADMIN) {
    if (!user.isActive) {
      throw new AppError(AUTH_MESSAGES.ADMIN_NOT_CURRENTLY_ACTIVE, HTTP_STATUS.CONFLICT, 'ADMIN_NOT_ACTIVE');
    }
    // A pure admin-only account has no other identity to fall back to —
    // revoking deactivates it entirely, the same mechanism already used
    // elsewhere to block a user's login (see authenticate middleware).
    user.isActive = false;
  } else if (user.isAdmin) {
    // A promoted account keeps its seafarer/recruiter identity fully intact
    // — only the extra admin-panel grant is removed.
    user.isAdmin = false;
  } else {
    throw new AppError(AUTH_MESSAGES.ADMIN_NOT_CURRENTLY_ACTIVE, HTTP_STATUS.CONFLICT, 'ADMIN_NOT_ACTIVE');
  }

  await user.save({ validateBeforeSave: false });

  // Kill every existing session immediately rather than letting a stale
  // refresh token silently keep minting new access tokens — authenticate
  // would reject the resulting requests anyway (it re-fetches live from
  // Mongo every time), but a lingering session otherwise just sits there
  // half-broken instead of forcing a clean, immediate re-login.
  await revokeAllRefreshTokens(user._id);

  await auditService.log({
    event: AUDIT_EVENTS.ADMIN_REVOKED,
    userId: revokingAdminId,
    ...ctxOf(req),
    metadata: { targetUserId: id, targetEmail: user.email },
  });

  return { id: user._id, email: user.email };
};

// ── Admin-only: update an existing admin's per-section scope ───────────────────

const updatePermissions = async (id, permissions, actingAdminId, req) => {
  if (id === actingAdminId.toString()) {
    throw new AppError(AUTH_MESSAGES.CANNOT_EDIT_OWN_PERMISSIONS, HTTP_STATUS.BAD_REQUEST, 'CANNOT_EDIT_OWN_PERMISSIONS');
  }

  const user = await User.findById(id);
  if (!user) {
    throw new AppError(AUTH_MESSAGES.ADMIN_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'ADMIN_NOT_FOUND');
  }

  // permissions: null/undefined in the request body means "grant full
  // access" — same absent-field convention used everywhere else.
  user.permissions = permissions ?? undefined;
  await user.save({ validateBeforeSave: false });

  auditService
    .log({
      event: AUDIT_EVENTS.ADMIN_PERMISSIONS_UPDATED,
      userId: actingAdminId,
      ...ctxOf(req),
      metadata: { targetUserId: id, targetEmail: user.email, permissions: user.permissions ?? null },
    })
    .catch(() => {});

  return presentAdmin(user);
};

module.exports = { listAdmins, inviteAdmin, acceptAdminInvite, revokeAdmin, updatePermissions };
