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
const { signAccessToken, createRefreshToken } = require('./token.service');
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

const presentAdmin = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  status: user.isActive ? 'active' : 'pending',
  invitedAt: user.createdAt,
});

// ── Admin-only: list + invite ─────────────────────────────────────────────────

const listAdmins = async () => {
  const admins = await User.find({ role: ROLES.ADMIN }).sort({ createdAt: -1 }).lean();
  return admins.map(presentAdmin);
};

const inviteAdmin = async ({ email }, invitedByAdminId, req) => {
  const existing = await User.findOne({ email });

  if (existing) {
    if (existing.role !== ROLES.ADMIN) {
      throw new AppError(AUTH_MESSAGES.EMAIL_BELONGS_TO_OTHER_ACCOUNT, HTTP_STATUS.CONFLICT, 'EMAIL_EXISTS');
    }
    if (existing.isActive) {
      throw new AppError(AUTH_MESSAGES.ADMIN_ALREADY_ACTIVE, HTTP_STATUS.CONFLICT, 'ADMIN_ALREADY_ACTIVE');
    }
    // Existing pending invite for this email — treat as a resend rather than
    // erroring, so an admin can re-invite someone whose first code expired.
  } else {
    // Placeholder name — the invited admin sets their real name when they
    // accept the invite. `password` is deliberately left unset (the User
    // schema doesn't require one, same as a Google-OAuth-created account)
    // until acceptAdminInvite completes.
    await User.create({
      name: email.split('@')[0],
      email,
      role: ROLES.ADMIN,
      isActive: false,
      emailVerified: false,
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
    metadata: { email },
  });

  return { email };
};

// ── Public: accept invite ─────────────────────────────────────────────────────

const acceptAdminInvite = async ({ email, otp, name, password }, req) => {
  validateStrength(password);

  const user = await User.findOne({ email, role: ROLES.ADMIN, isActive: false });
  if (!user) {
    throw new AppError(AUTH_MESSAGES.ADMIN_INVITE_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'INVITE_NOT_FOUND');
  }

  await verifyOtp(email, otp, OTP_PURPOSES.ADMIN_INVITE);

  user.name = name;
  user.password = password;
  user.isActive = true;
  user.emailVerified = true;
  await user.save();

  const context = ctxOf(req);
  const accessToken = signAccessToken(user);
  const refreshToken = await createRefreshToken(user._id, context);

  await auditService.log({ event: AUDIT_EVENTS.ADMIN_INVITE_ACCEPTED, userId: user._id, ...context });

  return {
    accessToken,
    refreshToken,
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
  };
};

module.exports = { listAdmins, inviteAdmin, acceptAdminInvite };
