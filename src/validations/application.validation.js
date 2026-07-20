'use strict';

const { body, param, query } = require('express-validator');
const { APPLICATION_STATUSES } = require('../models/application.model');

const jobIdParam = [
  param('jobId').isMongoId().withMessage('Invalid job ID.'),
];

const idParam = [
  param('id').isMongoId().withMessage('Invalid application ID.'),
];

const apply = [
  body('jobId').notEmpty().withMessage('jobId is required.').bail().isMongoId().withMessage('Invalid job ID.'),
];

const listQuery = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('status').optional().isIn(APPLICATION_STATUSES).withMessage('Invalid application status.'),
];

// Accepts either a single enum value or a comma-separated list (e.g. the
// admin "Closed" tab sends status=selected,rejected,withdrawn) — mirrors
// job.validation.js's csvIn() helper.
const csvIn = (allowed) => (value) => {
  const tokens = String(value).split(',').map((v) => v.trim()).filter(Boolean);
  if (!tokens.length || !tokens.every((t) => allowed.includes(t))) {
    throw new Error('Invalid value.');
  }
  return true;
};

const listAdminApplicationsQuery = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('search').optional().trim().isLength({ max: 200 }),
  query('status').optional().custom(csvIn(APPLICATION_STATUSES)),
  query('job').optional().isMongoId(),
  query('sort').optional().isIn(['newest', 'oldest']),
];

const updateApplicationStatus = [
  body('status').notEmpty().isIn(APPLICATION_STATUSES).withMessage('Invalid application status.'),
];

module.exports = {
  jobIdParam,
  idParam,
  apply,
  listQuery,
  listAdminApplicationsQuery,
  updateApplicationStatus,
};
