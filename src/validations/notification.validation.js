'use strict';

const { body, param, query } = require('express-validator');
const { NOTIFICATION_TYPES } = require('../models/notification.model');

// Accepts either a single type or a comma-separated list — mirrors
// job.validation.js's csvIn() helper.
const csvIn = (allowed) => (value) => {
  const tokens = String(value).split(',').map((v) => v.trim()).filter(Boolean);
  if (!tokens.length || !tokens.every((t) => allowed.includes(t))) {
    throw new Error('Invalid value.');
  }
  return true;
};

const typeFilter = query('type').optional().custom(csvIn(Object.values(NOTIFICATION_TYPES)));

const listQuery = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  typeFilter,
];

const unreadCountQuery = [typeFilter];

const markAllReadQuery = [typeFilter];

const idParam = [
  param('id').isMongoId().withMessage('Invalid notification ID.'),
];

const registerDeviceToken = [
  body('token').notEmpty().withMessage('token is required.'),
  body('platform').isIn(['ios', 'android']).withMessage('platform must be ios or android.'),
];

const deregisterDeviceToken = [
  body('token').notEmpty().withMessage('token is required.'),
];

module.exports = {
  listQuery,
  unreadCountQuery,
  markAllReadQuery,
  idParam,
  registerDeviceToken,
  deregisterDeviceToken,
};
