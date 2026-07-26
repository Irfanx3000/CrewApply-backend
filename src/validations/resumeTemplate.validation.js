'use strict';

const { body, param, query } = require('express-validator');
const { TEMPLATE_CATEGORIES } = require('../models/resumeTemplate.model');

const resumeTemplateIdParam = [
  param('id').isMongoId().withMessage('Invalid resume template ID.'),
];

const listQuery = [
  query('includeInactive').optional().isBoolean(),
];

const createResumeTemplate = [
  body('key')
    .trim()
    .notEmpty().withMessage('Key is required.')
    .bail()
    .matches(/^[a-z][a-z0-9-]{1,49}$/).withMessage('Key must be lowercase letters, numbers, or hyphens, starting with a letter.'),

  body('name').trim().notEmpty().withMessage('Name is required.').isLength({ max: 100 }).withMessage('Name must not exceed 100 characters.'),
  body('description').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 300 }),
  body('thumbnailUrl').optional({ nullable: true, checkFalsy: true }).trim(),
  body('category').optional({ nullable: true }).isIn(TEMPLATE_CATEGORIES).withMessage('Invalid template category.'),
  body('isActive').optional({ nullable: true }).isBoolean(),
  body('sortOrder').optional({ nullable: true }).isInt(),
  body('layout').optional({ nullable: true }).isObject().withMessage('layout must be an object.'),
];

const updateResumeTemplate = [
  // key is immutable — intentionally not accepted here.
  body('name').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 100 }),
  body('description').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 300 }),
  body('thumbnailUrl').optional({ nullable: true, checkFalsy: true }).trim(),
  body('category').optional({ nullable: true }).isIn(TEMPLATE_CATEGORIES).withMessage('Invalid template category.'),
  body('isActive').optional({ nullable: true }).isBoolean(),
  body('sortOrder').optional({ nullable: true }).isInt(),
  body('layout').optional({ nullable: true }).isObject().withMessage('layout must be an object.'),
];

module.exports = {
  resumeTemplateIdParam,
  listQuery,
  createResumeTemplate,
  updateResumeTemplate,
};
