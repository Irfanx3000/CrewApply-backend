'use strict';

const { body, param } = require('express-validator');
const { emailField } = require('./auth.validation');
const { PERMISSION_SECTIONS } = require('../models/user.model');

// Generates one pair of validators per section (`permissions.jobs.read`,
// `permissions.jobs.write`, etc.) — reused by both inviteAdmin (permissions
// is optional there, omitted = full access) and updatePermissions.
const permissionsFieldValidators = () =>
  PERMISSION_SECTIONS.flatMap((section) => [
    body(`permissions.${section}.read`).optional().isBoolean().withMessage(`permissions.${section}.read must be a boolean.`),
    body(`permissions.${section}.write`).optional().isBoolean().withMessage(`permissions.${section}.write must be a boolean.`),
  ]);

const inviteAdmin = [
  emailField(),
  body('confirm').optional().isBoolean().withMessage('confirm must be a boolean.'),
  // `nullable: true` is required, not cosmetic — "Grant full access" sends
  // `permissions: null` explicitly (not omitted), and `.optional()` on its
  // own only skips validation for `undefined`, not `null`. Without this,
  // every full-access invite/edit failed with "Validation failed." (same
  // class of bug as textSanitizer.js's noHtmlText `required` flag).
  body('permissions').optional({ nullable: true }).isObject().withMessage('permissions must be an object.'),
  ...permissionsFieldValidators(),
];

const idParam = [
  param('id').isMongoId().withMessage('Invalid admin ID.'),
];

const updatePermissions = [
  // `nullable: true` is required, not cosmetic — "Grant full access" sends
  // `permissions: null` explicitly (not omitted), and `.optional()` on its
  // own only skips validation for `undefined`, not `null`. Without this,
  // every full-access invite/edit failed with "Validation failed." (same
  // class of bug as textSanitizer.js's noHtmlText `required` flag).
  body('permissions').optional({ nullable: true }).isObject().withMessage('permissions must be an object.'),
  ...permissionsFieldValidators(),
];

module.exports = { inviteAdmin, idParam, updatePermissions };
