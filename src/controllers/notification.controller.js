'use strict';

const notificationService = require('../services/notification.service');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse, paginationMeta } = require('../utils/apiResponse');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

const listNotifications = asyncHandler(async (req, res) => {
  const { notifications, page, limit, total } = await notificationService.listForUser(req.user._id, req.query);

  return successResponse(
    res,
    AUTH_MESSAGES.NOTIFICATIONS_FETCHED,
    { notifications },
    HTTP_STATUS.OK,
    paginationMeta(page, limit, total)
  );
});

const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await notificationService.getUnreadCount(req.user._id, req.query);
  return successResponse(res, AUTH_MESSAGES.UNREAD_COUNT_FETCHED, { count });
});

const getUnreadCountsByType = asyncHandler(async (req, res) => {
  const counts = await notificationService.getUnreadCountsByType(req.user._id);
  return successResponse(res, AUTH_MESSAGES.UNREAD_COUNTS_BY_TYPE_FETCHED, { counts });
});

const markAsRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markRead(req.user._id, req.params.id);
  return successResponse(res, AUTH_MESSAGES.NOTIFICATION_MARKED_READ, { notification });
});

const markAllAsRead = asyncHandler(async (req, res) => {
  await notificationService.markAllRead(req.user._id, req.query);
  return successResponse(res, AUTH_MESSAGES.ALL_NOTIFICATIONS_MARKED_READ);
});

const registerDeviceToken = asyncHandler(async (req, res) => {
  await notificationService.registerDeviceToken(req.user._id, req.body);
  return successResponse(res, AUTH_MESSAGES.DEVICE_TOKEN_REGISTERED);
});

const deregisterDeviceToken = asyncHandler(async (req, res) => {
  await notificationService.deregisterDeviceToken(req.user._id, req.body.token);
  return successResponse(res, AUTH_MESSAGES.DEVICE_TOKEN_REMOVED);
});

const getNotificationSettings = asyncHandler(async (req, res) => {
  const settings = await notificationService.getNotificationSettings(req.user._id);
  return successResponse(res, AUTH_MESSAGES.NOTIFICATION_SETTINGS_FETCHED, settings);
});

const updateNotificationSettings = asyncHandler(async (req, res) => {
  const settings = await notificationService.updateNotificationSettings(req.user._id, req.body);
  return successResponse(res, AUTH_MESSAGES.NOTIFICATION_SETTINGS_UPDATED, settings);
});

module.exports = {
  listNotifications,
  getUnreadCount,
  getUnreadCountsByType,
  markAsRead,
  markAllAsRead,
  registerDeviceToken,
  deregisterDeviceToken,
  getNotificationSettings,
  updateNotificationSettings,
};
