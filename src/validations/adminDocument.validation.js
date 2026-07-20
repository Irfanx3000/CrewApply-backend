'use strict';

const { param } = require('express-validator');

const documentIdParam = [
  param('id').isMongoId().withMessage('Invalid document ID.'),
];

module.exports = { documentIdParam };
