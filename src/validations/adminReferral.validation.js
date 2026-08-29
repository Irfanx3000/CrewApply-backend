'use strict';

const { body, query, param } = require('express-validator');
const { REFERRAL_STATUSES } = require('../models/referral.model');

const idParam = [
  param('id').isMongoId().withMessage('Invalid referral ID.'),
];

const listReferralsQuery = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('search').optional().trim().isLength({ max: 200 }),
  query('status').optional().isIn(REFERRAL_STATUSES).withMessage('Invalid referral status.'),
];

// Only the two transitions an admin can actually drive. 'pending' and
// 'qualified' are machine-owned lifecycle states — letting the API set them
// by hand would desync the Referral row from the wallet ledger that backs it
// (see referral.service.js's setReferralStatus).
const ADMIN_SETTABLE_STATUSES = ['rejected', 'rewarded'];

const updateReferralStatus = [
  body('status')
    .notEmpty()
    .isIn(ADMIN_SETTABLE_STATUSES)
    .withMessage(`Status must be one of: ${ADMIN_SETTABLE_STATUSES.join(', ')}.`),
];

const referralSettingsBody = [
  body('rewardAmount').optional({ nullable: true }).isInt({ min: 0 }).withMessage('rewardAmount must be a non-negative integer (paise).'),
  body('maxRewardsPerMonth').optional({ nullable: true }).isInt({ min: 0 }).withMessage('maxRewardsPerMonth must be a non-negative integer (0 = unlimited).'),
  body('enabled').optional({ nullable: true }).isBoolean().withMessage('enabled must be a boolean.'),
];

module.exports = { idParam, listReferralsQuery, updateReferralStatus, referralSettingsBody };
