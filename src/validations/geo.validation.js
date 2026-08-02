'use strict';

const { query } = require('express-validator');

const getCities = [
  query('country')
    .trim()
    .notEmpty().withMessage('Country ISO code is required.')
    .isLength({ min: 2, max: 3 }).withMessage('Country must be a valid ISO code.'),
  query('state')
    .trim()
    .notEmpty().withMessage('State ISO code is required.')
    .isLength({ min: 1, max: 10 }).withMessage('State must be a valid ISO code.'),
];

module.exports = { getCities };
