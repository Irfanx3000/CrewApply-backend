'use strict';

const { body, param } = require('express-validator');

const resumeConfigurationIdParam = [
  param('id').isMongoId().withMessage('Invalid resume ID.'),
];

const createResumeConfiguration = [
  body('title').trim().notEmpty().withMessage('Title is required.').isLength({ max: 100 }),
  body('templateId').notEmpty().withMessage('Template is required.').isMongoId().withMessage('Invalid template ID.'),
  body('objectiveOverride').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 1000 }),
  body('visibility').optional({ nullable: true }).isObject(),
];

const updateResumeConfiguration = [
  body('title').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 100 }),
  body('templateId').optional({ nullable: true }).isMongoId().withMessage('Invalid template ID.'),
  body('objectiveOverride').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 1000 }),
  body('selection').optional({ nullable: true }).isObject(),
  body('selection.experienceIds').optional({ nullable: true }).isArray(),
  body('selection.educationIds').optional({ nullable: true }).isArray(),
  body('selection.skillIds').optional({ nullable: true }).isArray(),
  body('selection.languageIds').optional({ nullable: true }).isArray(),
  body('selection.referenceIds').optional({ nullable: true }).isArray(),
  body('visibility').optional({ nullable: true }).isObject(),
];

const renderResumeConfiguration = [
  body('format').optional({ nullable: true }).isIn(['pdf']).withMessage('Invalid format.'),
];

module.exports = {
  resumeConfigurationIdParam,
  createResumeConfiguration,
  updateResumeConfiguration,
  renderResumeConfiguration,
};
