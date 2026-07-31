'use strict';

const { body } = require('express-validator');

/**
 * Shared free-text validator for user-entered content (career profile
 * entries, resume titles/objectives, etc.) that should never legitimately
 * contain markup. Rejects rather than strips — consistent with every other
 * rule in this codebase (isIn, isLength, ...), so the caller always knows
 * exactly what was stored.
 *
 * @param {string} field   - dot-path express-validator body field, e.g. 'role' or 'responsibilities.*'
 * @param {object} [opts]
 * @param {number} [opts.max]      - max character length
 * @param {boolean} [opts.required] - if true, empty/missing is rejected instead of skipped
 */
const noHtmlText = (field, { max, required = false } = {}) => {
  // `.optional()` skips a field whenever it's undefined, regardless of
  // `checkFalsy` — that flag only controls whether *falsy-but-present*
  // values (e.g. '') are also skipped. So a `required` field must skip
  // `.optional()` entirely, not just pass `checkFalsy: false` to it.
  let chain = body(field).trim();
  chain = required
    ? chain.notEmpty().withMessage(`${field} is required.`)
    : chain.optional({ nullable: true, checkFalsy: true });
  if (max) {
    chain = chain.isLength({ max }).withMessage(`${field} must not exceed ${max} characters.`);
  }
  return chain.matches(/^[^<>]*$/).withMessage(`${field} must not contain HTML or script tags.`);
};

module.exports = { noHtmlText };
