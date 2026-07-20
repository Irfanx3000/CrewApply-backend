'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const notificationController = require('../controllers/notification.controller');
const notificationValidation = require('../validations/notification.validation');

router.use(authenticate);

router.get('/', validate(notificationValidation.listQuery), notificationController.listNotifications);
router.get(
  '/unread-count',
  validate(notificationValidation.unreadCountQuery),
  notificationController.getUnreadCount
);
router.post('/read-all', notificationController.markAllAsRead);
router.post('/:id/read', validate(notificationValidation.idParam), notificationController.markAsRead);
router.post(
  '/device-token',
  validate(notificationValidation.registerDeviceToken),
  notificationController.registerDeviceToken
);
router.delete(
  '/device-token',
  validate(notificationValidation.deregisterDeviceToken),
  notificationController.deregisterDeviceToken
);

module.exports = router;
