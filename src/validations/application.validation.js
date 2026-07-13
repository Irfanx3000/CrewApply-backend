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

module.exports = {
  jobIdParam,
  idParam,
  apply,
  listQuery,
};
