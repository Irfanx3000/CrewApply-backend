'use strict';

const { body, param, query } = require('express-validator');
const { ACCEPTED_FILE_TYPES } = require('../models/documentType.model');

const optionalString = (field, max = 200) =>
  body(field)
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max }).withMessage(`${field} must not exceed ${max} characters.`);

const documentTypeIdParam = [
  param('id').isMongoId().withMessage('Invalid document type ID.'),
];

const listQuery = [
  query('includeInactive').optional().isBoolean(),
];

const createDocumentType = [
  body('key')
    .trim()
    .notEmpty().withMessage('Key is required.')
    .bail()
    .matches(/^[a-z][a-z0-9_]{1,49}$/).withMessage('Key must be lowercase letters, numbers, or underscores, starting with a letter.'),

  body('label').trim().notEmpty().withMessage('Label is required.').isLength({ max: 100 }).withMessage('Label must not exceed 100 characters.'),
  optionalString('description', 300),

  body('acceptedFileTypes').notEmpty().withMessage('acceptedFileTypes is required.').isIn(ACCEPTED_FILE_TYPES).withMessage('acceptedFileTypes must be pdf, image, or both.'),
  body('maxSizeMB').notEmpty().withMessage('maxSizeMB is required.').isInt({ min: 1, max: 20 }).withMessage('maxSizeMB must be between 1 and 20.'),

  body('allowMultiple').optional({ nullable: true }).isBoolean(),
  body('isRequirableForJob').optional({ nullable: true }).isBoolean(),
  body('isActive').optional({ nullable: true }).isBoolean(),
  body('sortOrder').optional({ nullable: true }).isInt(),

  body('icon').trim().notEmpty().withMessage('Icon is required.'),
];

const updateDocumentType = [
  // key is immutable — intentionally not accepted here.
  optionalString('label', 100),
  optionalString('description', 300),
  body('acceptedFileTypes').optional({ nullable: true }).isIn(ACCEPTED_FILE_TYPES).withMessage('acceptedFileTypes must be pdf, image, or both.'),
  body('maxSizeMB').optional({ nullable: true }).isInt({ min: 1, max: 20 }).withMessage('maxSizeMB must be between 1 and 20.'),
  body('allowMultiple').optional({ nullable: true }).isBoolean(),
  body('isRequirableForJob').optional({ nullable: true }).isBoolean(),
  body('isActive').optional({ nullable: true }).isBoolean(),
  body('sortOrder').optional({ nullable: true }).isInt(),
  optionalString('icon', 100),
];

module.exports = {
  documentTypeIdParam,
  listQuery,
  createDocumentType,
  updateDocumentType,
};
