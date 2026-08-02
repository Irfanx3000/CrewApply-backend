'use strict';

const { query, param } = require('express-validator');

const listHistoryQuery = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
];

const transactionIdParam = [param('id').isMongoId().withMessage('Invalid transaction id.')];

module.exports = { listHistoryQuery, transactionIdParam };
