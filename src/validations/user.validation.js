'use strict';

const { body, param } = require('express-validator');

// ── Reusable helpers ──────────────────────────────────────────────────────────

const optionalDate = (field) =>
  body(field)
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601().withMessage(`${field} must be a valid date (YYYY-MM-DD).`);

const optionalString = (field, max = 200) =>
  body(field)
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max }).withMessage(`${field} must not exceed ${max} characters.`);

const optionalPositiveNumber = (field) =>
  body(field)
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0, max: 60 }).withMessage(`${field} must be a number between 0 and 60.`);

// ── PATCH /user/profile ───────────────────────────────────────────────────────

const updateProfile = [
  body('name')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters.'),

  body('dateOfBirth')
    .optional({ nullable: true, checkFalsy: true })
    .custom((val) => {
      // Accept DD-MM-YYYY or ISO
      const ddmm = /^(\d{2})-(\d{2})-(\d{4})$/.exec(val);
      if (ddmm) return true;
      return !isNaN(new Date(val).getTime());
    }).withMessage('Date of birth must be a valid date.'),

  body('gender')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(['Male', 'Female', 'Others']).withMessage('Gender must be Male, Female, or Others.'),

  optionalString('nationality', 100),
  optionalString('country', 100),
  optionalString('state', 100),
  optionalString('city', 100),

  body('maritalStatus')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(['Single', 'Married', 'Divorced', 'Widowed']).withMessage('Invalid marital status.'),

  optionalString('alternatePhone', 20),
  optionalString('currentLocation', 200),
];

// ── PATCH /user/maritime-profile ──────────────────────────────────────────────

const updateMaritimeProfile = [
  optionalString('department', 100),
  optionalString('rank', 100),
  optionalString('designation', 100),
  optionalDate('experienceStartDate'),
  optionalDate('experienceEndDate'),
  optionalString('certificatesSummary', 500),
  optionalString('currentVessel', 100),
  optionalString('preferredVessel', 100),
  optionalString('preferredRank', 100),
  optionalPositiveNumber('seaExperienceYears'),
  optionalString('licenseNumbers', 300),
  optionalDate('medicalExpiry'),
  optionalDate('passportExpiry'),
  optionalString('cdcNumber', 50),
  optionalDate('availabilityDate'),
];

// ── Document metadata validators ──────────────────────────────────────────────

const certificateMetadata = [
  body('type')
    .trim()
    .notEmpty().withMessage('Certificate type is required.'),
  optionalDate('issueDate'),
  optionalDate('expiryDate'),
  optionalString('issuingAuthority', 200),
];

const passportMetadata = [
  body('passportNumber')
    .trim()
    .notEmpty().withMessage('Passport number is required.'),
  optionalDate('expiryDate'),
  optionalString('nationality', 100),
];

const cdcMetadata = [
  body('cdcNumber')
    .trim()
    .notEmpty().withMessage('CDC number is required.'),
  optionalString('country', 100),
  optionalDate('expiryDate'),
];

const medicalMetadata = [
  optionalDate('expiryDate'),
  optionalString('doctor', 100),
  optionalString('hospital', 200),
];

const visaMetadata = [
  body('country')
    .trim()
    .notEmpty().withMessage('Visa country is required.'),
  optionalString('visaNumber', 50),
  optionalDate('expiryDate'),
];

// ── Document ID param ─────────────────────────────────────────────────────────

const documentIdParam = [
  param('id')
    .isMongoId().withMessage('Invalid document ID.'),
];

module.exports = {
  updateProfile,
  updateMaritimeProfile,
  certificateMetadata,
  passportMetadata,
  cdcMetadata,
  medicalMetadata,
  visaMetadata,
  documentIdParam,
};
