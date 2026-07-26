'use strict';

const { body, param, query } = require('express-validator');
const { JOB_TAXONOMY_TYPES } = require('../models/jobTaxonomy.model');

const jobTaxonomyIdParam = [
  param('id').isMongoId().withMessage('Invalid job taxonomy ID.'),
];

// Public route requires `type` (there's no legitimate "give me everything"
// public use case). Admin list route keeps it optional so the panel could
// later list all types at once.
const publicListQuery = [
  query('type').notEmpty().withMessage('Type is required.').isIn(JOB_TAXONOMY_TYPES).withMessage('Invalid taxonomy type.'),
];

const listQuery = [
  query('type').optional().isIn(JOB_TAXONOMY_TYPES).withMessage('Invalid taxonomy type.'),
  query('includeInactive').optional().isBoolean(),
];

// Only meaningful for type:'category' today, but shape-checked regardless —
// harmless for department/vesselType, which just never send it.
const iconRules = [
  body('icon.type').optional({ nullable: true }).isIn(['default', 'custom']).withMessage('Invalid icon type.'),
  body('icon.key').optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 50 }),
  body('icon.imageUrl').optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 500 }),
  body('icon').optional({ nullable: true }).custom((icon) => {
    if (icon?.type === 'custom' && !icon.imageUrl) {
      throw new Error('icon.imageUrl is required when icon.type is "custom".');
    }
    return true;
  }),
];

const createJobTaxonomy = [
  body('type').notEmpty().withMessage('Type is required.').isIn(JOB_TAXONOMY_TYPES).withMessage('Invalid taxonomy type.'),
  body('name').trim().notEmpty().withMessage('Name is required.').isLength({ max: 100 }).withMessage('Name must not exceed 100 characters.'),
  body('sortOrder').optional({ nullable: true }).isInt(),
  ...iconRules,
];

const updateJobTaxonomy = [
  // name/type are immutable — intentionally not accepted here.
  body('isActive').optional({ nullable: true }).isBoolean(),
  body('sortOrder').optional({ nullable: true }).isInt(),
  ...iconRules,
];

module.exports = {
  jobTaxonomyIdParam,
  publicListQuery,
  listQuery,
  createJobTaxonomy,
  updateJobTaxonomy,
};
