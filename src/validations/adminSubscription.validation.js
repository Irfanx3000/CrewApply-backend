'use strict';

const { query } = require('express-validator');
const { SUBSCRIPTION_STATUSES } = require('../models/subscription.model');
const { PLAN_TIERS } = require('../models/plan.model');

const csvIn = (allowed) => (value) => {
  const tokens = String(value).split(',').map((v) => v.trim()).filter(Boolean);
  if (!tokens.length || !tokens.every((t) => allowed.includes(t))) {
    throw new Error('Invalid value.');
  }
  return true;
};

const listSubscriptionsQuery = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('search').optional().trim().isLength({ max: 200 }),
  query('status').optional().custom(csvIn(SUBSCRIPTION_STATUSES)),
  query('tier').optional().custom(csvIn(PLAN_TIERS)),
];

module.exports = { listSubscriptionsQuery };
