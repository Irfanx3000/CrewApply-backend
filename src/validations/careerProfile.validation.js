'use strict';

const { body, param } = require('express-validator');
const { ARRAY_FIELDS, SKILL_LEVELS, LANGUAGE_PROFICIENCIES, CUSTOM_SECTION_TYPES } = require('../models/careerProfile.model');
const { noHtmlText } = require('./textSanitizer');

const sectionParam = [
  param('section').isIn(ARRAY_FIELDS).withMessage('Invalid career profile section.'),
];

const entryIdParam = [
  ...sectionParam,
  param('entryId').isMongoId().withMessage('Invalid entry ID.'),
];

const updateCareerObjective = [
  noHtmlText('careerObjective', { max: 1000 }),
];

// Body shape depends on which section is being written to — validated by a
// single custom check keyed off req.params.section rather than one
// express-validator chain per section, since the required-field set differs
// per array (see careerProfile.model.js's subdocument schemas). Per-field
// chains below stay `required: false` for the same reason — presence is
// already enforced above per-section; a field simply won't exist in the
// body for a section it doesn't belong to, and `optional()` skips it then.
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
  body('isCurrent').optional({ nullable: true }).isBoolean(),

  // Free-text fields — same maxlengths as careerProfile.model.js's
  // subdocument schemas, plus the shared HTML/script rejection.
  noHtmlText('role', { max: 150 }),
  noHtmlText('vesselName', { max: 150 }),
  noHtmlText('vesselType', { max: 100 }),
  noHtmlText('company', { max: 150 }),
  noHtmlText('location', { max: 150 }),
  noHtmlText('institution', { max: 150 }),
  noHtmlText('degree', { max: 150 }),
  noHtmlText('fieldOfStudy', { max: 150 }),
  noHtmlText('description', { max: 1000 }),
  // Shared by skills/languages/references — the tightest per-section cap
  // (skills: 100, languages: 50, references: 100) still applies via the
  // Mongoose schema at save time; this is a generous early UX-layer check.
  noHtmlText('name', { max: 150 }),
  noHtmlText('category', { max: 50 }),
  noHtmlText('relationship', { max: 100 }),
  noHtmlText('phone', { max: 30 }),
  noHtmlText('email', { max: 150 }),
  noHtmlText('title', { max: 100 }),

  body('responsibilities').optional({ nullable: true }).isArray({ max: 15 }).withMessage('responsibilities must be an array of at most 15 items.'),
  noHtmlText('responsibilities.*', { max: 300 }),
];

module.exports = {
  sectionParam,
  entryIdParam,
  updateCareerObjective,
  entryBody,
};
