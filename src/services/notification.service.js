'use strict';

const Notification = require('../models/notification.model');
const User = require('../models/user.model');
const pushService = require('./push.service');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');
const { ROLES } = require('../constants/roles');

/**
 * Creates a notification for a user and fires a push send in the background.
 *
 * This function never throws — a notification-creation failure must not
 * interrupt the caller's primary action (e.g. an admin changing an
 * application's status). Mirrors audit.service.js's fire-and-forget contract.
 *
 * The push send is deliberately NOT awaited — it's a network call with
 * unpredictable latency, and blocking the caller's response on it would be
 * a regression (see push.service.js, which itself never throws either).
 */
const create = async ({ userId, type, title, body, data = null }) => {
  try {
    const notification = await Notification.create({ user: userId, type, title, body, data });
    pushService.sendToUser(userId, { title, body, data }).catch(() => {});
    return notification;
  } catch (err) {
    console.error('NotificationService: failed to create notification:', err.message);
    return null;
  }
};

/**
 * Notifies every active admin — "the admin" isn't a single user, so this
 * creates one independent Notification doc per admin (own read/unread state
 * each) rather than trying to share a single doc across recipients.
 *
 * Never throws, same contract as create().
 */
const notifyAdmins = async ({ type, title, body, data = null }) => {
  try {
    const admins = await User.find({ role: ROLES.ADMIN, isActive: true }).select('_id');
    await Promise.all(admins.map((admin) => create({ userId: admin._id, type, title, body, data })));
  } catch (err) {
    console.error('NotificationService: failed to notify admins:', err.message);
  }
};

// Accepts either a single type or a comma-separated list (e.g. the admin
// panel asks for "APPLICATION_SUBMITTED,SUBSCRIPTION_PURCHASED,USER_REGISTERED")
// — mirrors application.service.js's parseCsvFilter().
const parseCsvFilter = (value) => {
  const tokens = String(value).split(',').map((v) => v.trim()).filter(Boolean);
  return tokens.length > 1 ? { $in: tokens } : tokens[0];
};

const listForUser = async (userId, { page = 1, limit = 20, type } = {}) => {
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
  const skip = (pageNum - 1) * limitNum;

  const filter = { user: userId };
  if (type) filter.type = parseCsvFilter(type);

  const [notifications, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    Notification.countDocuments(filter),
  ]);

  return { notifications, page: pageNum, limit: limitNum, total };
};

const getUnreadCount = async (userId, { type } = {}) => {
  const filter = { user: userId, read: false };
  if (type) filter.type = parseCsvFilter(type);
  return Notification.countDocuments(filter);
};

const markRead = async (userId, notificationId) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, user: userId },
    { read: true, readAt: new Date() },
    { new: true }
  );

  if (!notification) {
    throw new AppError(AUTH_MESSAGES.NOTIFICATION_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  return notification;
};

const markAllRead = async (userId) => {
  await Notification.updateMany({ user: userId, read: false }, { read: true, readAt: new Date() });
};

const registerDeviceToken = async (userId, { token, platform }) => {
  await User.updateOne({ _id: userId }, { $pull: { deviceTokens: { token } } });
  await User.updateOne({ _id: userId }, { $push: { deviceTokens: { token, platform, createdAt: new Date() } } });
};

const deregisterDeviceToken = async (userId, token) => {
  await User.updateOne({ _id: userId }, { $pull: { deviceTokens: { token } } });
};

module.exports = {
  create,
  notifyAdmins,
  listForUser,
  getUnreadCount,
  markRead,
  markAllRead,
  registerDeviceToken,
  deregisterDeviceToken,
  NOTIFICATION_TYPES: Notification.NOTIFICATION_TYPES,
};
