'use strict';

const { param } = require('express-validator');

const jobIdParam = [
  param('jobId').isMongoId().withMessage('Invalid job ID.'),
];

module.exports = { jobIdParam };
