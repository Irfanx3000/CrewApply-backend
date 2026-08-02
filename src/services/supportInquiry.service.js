'use strict';

const SupportInquiry = require('../models/supportInquiry.model');
const User = require('../models/user.model');
const notificationService = require('./notification.service');
const auditService = require('./audit.service');
const { statusOf } = require('./adminUser.service');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');
const { AUDIT_EVENTS } = require('../constants/audit');
const { TIER_RANK } = require('../models/plan.model');
const { buildRegex } = require('../utils/searchUtil');

const ctxOf = (req) => ({
  ipAddress: req?.ip || null,
  userAgent: req?.get?.('user-agent') || null,
});

const audit = (event, userId, req, metadata = {}) =>
  auditService.log({ event, userId, ...ctxOf(req), metadata }).catch(() => {});

const parsePagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
};

const parseCsvFilter = (value) => {
  const tokens = String(value).split(',').map((v) => v.trim()).filter(Boolean);
  return tokens.length > 1 ? { $in: tokens } : tokens[0];
};

// Default notification body per status when the admin doesn't write a reply
// of their own — a status change should always notify the user, even if
// there's no custom message.
const DEFAULT_STATUS_BODY = {
  new: 'Your support request has been reopened.',
  in_progress: 'Your support request is being looked into.',
  resolved: 'Your support request has been resolved.',
};

const presentInquiry = (i) => ({
  id: i._id,
  name: i.name,
  email: i.email,
  message: i.message,
  subscriptionTier: i.subscriptionTierSnapshot,
  source: i.source,
  accountStatusSnapshot: i.accountStatusSnapshot,
  status: i.status,
  adminReply: i.adminReply,
  createdAt: i.createdAt,
  statusUpdatedAt: i.statusUpdatedAt,
});

// ── User-facing: submit ───────────────────────────────────────────────────────

const createInquiry = async ({ user, name, email, message }, req) => {
  const inquiry = await SupportInquiry.create({
    user: user._id,
    name,
    email,
    message,
    subscriptionTierSnapshot: user.subscriptionTier || null,
    priorityRank: TIER_RANK[user.subscriptionTier] || 0,
  });

  audit(AUDIT_EVENTS.SUPPORT_INQUIRY_CREATED, user._id, req, { inquiryId: inquiry._id });

  notificationService
    .notifyAdmins({
      type: notificationService.NOTIFICATION_TYPES.SUPPORT_INQUIRY_CREATED,
      title: 'New Support Inquiry',
      body: `${name} submitted a support request.`,
      data: { inquiryId: inquiry._id },
    })
    .catch(() => {});

  return presentInquiry(inquiry);
};

// Unauthenticated variant — reached from a logged-out or blocked user (the
// "Account Blocked" screen, or the Help & Support menu on the Auth stack).
// Best-effort matches the submitted email against an existing account purely
// so the admin list can flag "this is coming from a blocked/deleted user" —
// no session, no token, no data about the account is ever returned.
const createPublicInquiry = async ({ name, email, message }, req) => {
  const matchedUser = await User.findOne({ email: email.toLowerCase().trim() })
    .select('_id subscriptionTier isActive isDeleted');

  const inquiry = await SupportInquiry.create({
    user: matchedUser ? matchedUser._id : null,
    name,
    email,
    message,
    source: 'public',
    subscriptionTierSnapshot: matchedUser?.subscriptionTier || null,
    priorityRank: TIER_RANK[matchedUser?.subscriptionTier] || 0,
    accountStatusSnapshot: matchedUser ? statusOf(matchedUser) : null,
  });

  audit(AUDIT_EVENTS.SUPPORT_INQUIRY_CREATED, matchedUser?._id || null, req, {
    inquiryId: inquiry._id,
    source: 'public',
  });

  notificationService
    .notifyAdmins({
      type: notificationService.NOTIFICATION_TYPES.SUPPORT_INQUIRY_CREATED,
      title: 'New Support Inquiry',
      body: `${name} submitted a support request.`,
      data: { inquiryId: inquiry._id },
    })
    .catch(() => {});

  return presentInquiry(inquiry);
};

// ── Admin: list/detail/status ─────────────────────────────────────────────────

const listAdminInquiries = async (query) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  if (query.status) filter.status = parseCsvFilter(query.status);
  if (query.search) {
    const rx = buildRegex(query.search);
    filter.$or = [{ name: rx }, { email: rx }];
  }

  const [inquiries, total] = await Promise.all([
    SupportInquiry.find(filter)
      .sort({ priorityRank: -1, createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SupportInquiry.countDocuments(filter),
  ]);

  return { inquiries: inquiries.map(presentInquiry), page, limit, total };
};

const getAdminInquiryById = async (id) => {
  const inquiry = await SupportInquiry.findById(id).lean();
  if (!inquiry) {
    throw new AppError(AUTH_MESSAGES.SUPPORT_INQUIRY_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }
  return presentInquiry(inquiry);
};

const updateInquiryStatus = async (id, { status, reply }, adminId, req) => {
  const inquiry = await SupportInquiry.findById(id);
  if (!inquiry) {
    throw new AppError(AUTH_MESSAGES.SUPPORT_INQUIRY_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  inquiry.status = status;
  inquiry.adminReply = reply || null;
  inquiry.statusUpdatedAt = new Date();
  inquiry.statusUpdatedBy = adminId;
  await inquiry.save();

  await notificationService.create({
    userId: inquiry.user,
    type: notificationService.NOTIFICATION_TYPES.SUPPORT_INQUIRY_UPDATED,
    title: 'Your support request was updated',
    body: reply?.trim() || DEFAULT_STATUS_BODY[status],
    data: { inquiryId: inquiry._id },
  });

  audit(AUDIT_EVENTS.SUPPORT_INQUIRY_STATUS_CHANGED, adminId, req, { inquiryId: inquiry._id, status });

  return getAdminInquiryById(inquiry._id);
};

module.exports = {
  createInquiry,
  createPublicInquiry,
  listAdminInquiries,
  getAdminInquiryById,
  updateInquiryStatus,
};
