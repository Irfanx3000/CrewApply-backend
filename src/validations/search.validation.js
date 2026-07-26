'use strict';

const { query } = require('express-validator');

// app.js's global body/param sanitizer does NOT touch req.query — this
// validator plus searchUtil's escapeRegex (used when the term is embedded in
// a RegExp) are the only protection for this param.
const search = [
  query('q')
    .trim()
    .notEmpty().withMessage('Search query is required.')
    .isLength({ min: 2, max: 100 }).withMessage('Search query must be between 2 and 100 characters.'),
];

module.exports = { search };
