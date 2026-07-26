'use strict';

const { body, param } = require('express-validator');
const { ARRAY_FIELDS, SKILL_LEVELS, LANGUAGE_PROFICIENCIES, CUSTOM_SECTION_TYPES } = require('../models/careerProfile.model');

const sectionParam = [
  param('section').isIn(ARRAY_FIELDS).withMessage('Invalid career profile section.'),
];

const entryIdParam = [
  ...sectionParam,
  param('entryId').isMongoId().withMessage('Invalid entry ID.'),
];

const updateCareerObjective = [
  body('careerObjective').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 1000 }).withMessage('Career objective must not exceed 1000 characters.'),
];

// Body shape depends on which section is being written to — validated by a
// single custom check keyed off req.params.section rather than one
// express-validator chain per section, since the required-field set differs
// per array (see careerProfile.model.js's subdocument schemas).
const REQUIRED_FIELD_BY_SECTION = {
  experience: 'role',
  education: 'institution',
  skills: 'name',
  languages: 'name',
  references: 'name',
  customSections: 'title',
};

const entryBody = [
  body().custom((value, { req }) => {
    const requiredField = REQUIRED_FIELD_BY_SECTION[req.params.section];
    if (requiredField && !value?.[requiredField]) {
      throw new Error(`${requiredField} is required.`);
    }
    return true;
  }),
  body('level').optional({ nullable: true }).isIn(SKILL_LEVELS).withMessage('Invalid skill level.'),
  body('proficiency').optional({ nullable: true }).isIn(LANGUAGE_PROFICIENCIES).withMessage('Invalid language proficiency.'),
  body('type').optional({ nullable: true }).isIn(CUSTOM_SECTION_TYPES).withMessage('Invalid custom section type.'),
  body('responsibilities').optional({ nullable: true }).isArray().withMessage('responsibilities must be an array.'),
  body('isCurrent').optional({ nullable: true }).isBoolean(),
];

module.exports = {
  sectionParam,
  entryIdParam,
  updateCareerObjective,
  entryBody,
};
