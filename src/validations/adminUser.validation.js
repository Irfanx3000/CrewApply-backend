'use strict';

const { body, query, param } = require('express-validator');
const { PLAN_TIERS } = require('../models/plan.model');
const { ROLES } = require('../constants/roles');
const { VALID_STATUSES } = require('../services/adminUser.service');

const idParam = [
  param('id').isMongoId().withMessage('Invalid user ID.'),
];

const listUsersQuery = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('search').optional().trim().isLength({ max: 200 }),
  query('status').optional().isIn(VALID_STATUSES).withMessage('Invalid status filter.'),
  query('role').optional().isIn([ROLES.USER, ROLES.EMPLOYER]).withMessage('Invalid role filter.'),
  query('subscriptionTier').optional().isIn(PLAN_TIERS).withMessage('Invalid subscription tier filter.'),
];

const countWords = (str) => String(str || '').trim().split(/\s+/).filter(Boolean).length;

const updateUserStatus = [
  body('status').notEmpty().isIn(VALID_STATUSES).withMessage('Invalid user status.'),
  body('reason')
    .optional({ nullable: true, checkFalsy: true })
    .isString().trim()
    .isLength({ max: 250 }).withMessage('Reason must not exceed 250 characters.')
    .custom((value) => countWords(value) <= 25).withMessage('Reason must be 25 words or fewer.'),
];

module.exports = { idParam, listUsersQuery, updateUserStatus };
