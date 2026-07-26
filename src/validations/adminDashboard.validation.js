'use strict';

const { query } = require('express-validator');

const chartQuery = [
  query('metric').notEmpty().isIn(['revenue', 'subscribers', 'applications', 'jobs']).withMessage('Invalid metric.'),
  query('range').notEmpty().isIn(['7d', '30d', '90d', '1y']).withMessage('Invalid range.'),
];

module.exports = { chartQuery };
