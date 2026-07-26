'use strict';

const { body, query, param } = require('express-validator');
const {
  JOB_DESIGNATIONS,
  JOB_EMPLOYMENT_TYPES,
  JOB_STATUSES,
} = require('../models/job.model');
const { PLAN_TIERS } = require('../models/plan.model');
const DocumentType = require('../models/documentType.model');
const JobTaxonomy = require('../models/jobTaxonomy.model');

// ── Reusable helpers ──────────────────────────────────────────────────────────

const optionalString = (field, max = 200) =>
  body(field)
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max }).withMessage(`${field} must not exceed ${max} characters.`);

const optionalDate = (field) =>
  body(field)
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601().withMessage(`${field} must be a valid date (YYYY-MM-DD).`);

// ── Shared field validators (used by both create and update) ─────────────────

const salaryMaxAtLeastMin = body('salary.max')
  .optional({ nullable: true, checkFalsy: true })
  .custom((value, { req }) => {
    const min = req.body?.salary?.min;
    if (min != null && value != null && Number(value) < Number(min)) {
      throw new Error('salary.max must be greater than or equal to salary.min.');
    }
    return true;
  });

const experienceMaxAtLeastMin = body('experience.maxYears')
  .optional({ nullable: true, checkFalsy: true })
  .custom((value, { req }) => {
    const min = req.body?.experience?.minYears;
    if (min != null && value != null && Number(value) < Number(min)) {
      throw new Error('experience.maxYears must be greater than or equal to experience.minYears.');
    }
    return true;
  });

const sharedFieldRules = (required) => {
  const notEmpty = (validator) => (required ? validator.notEmpty() : validator.optional({ nullable: true, checkFalsy: true }));

  return [
    notEmpty(body('title').trim()).isLength({ max: 150 }).withMessage('Title must not exceed 150 characters.'),
    notEmpty(body('companyName').trim()).isLength({ max: 150 }).withMessage('Company name must not exceed 150 characters.'),
    optionalString('companyLogoUrl', 500),

    notEmpty(body('department')).bail().custom(async (value) => {
      const taxonomy = await JobTaxonomy.findOne({ type: 'department', name: value, isActive: true }).lean();
      if (!taxonomy) throw new Error('Invalid department.');
      return true;
    }),
    notEmpty(body('rank').trim()).isLength({ max: 100 }).withMessage('Rank must not exceed 100 characters.'),
    body('designation').optional({ nullable: true, checkFalsy: true }).isIn(JOB_DESIGNATIONS).withMessage('Invalid designation.'),
    body('category').optional({ nullable: true, checkFalsy: true }).bail().custom(async (value) => {
      const taxonomy = await JobTaxonomy.findOne({ type: 'category', name: value, isActive: true }).lean();
      if (!taxonomy) throw new Error('Invalid category.');
      return true;
    }),
    notEmpty(body('vesselType')).bail().custom(async (value) => {
      const taxonomy = await JobTaxonomy.findOne({ type: 'vesselType', name: value, isActive: true }).lean();
      if (!taxonomy) throw new Error('Invalid vessel type.');
      return true;
    }),

    notEmpty(body('location.country').trim()).isLength({ max: 100 }).withMessage('Location country must not exceed 100 characters.'),
    optionalString('location.city', 100),

    notEmpty(body('employmentType')).isIn(JOB_EMPLOYMENT_TYPES).withMessage('Invalid employment type.'),

    body('experience.minYears').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 60 }),
    body('experience.maxYears').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 60 }),
    experienceMaxAtLeastMin,

    body('salary.min').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
    body('salary.max').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
    body('salary.currency').optional({ nullable: true, checkFalsy: true }).matches(/^[A-Za-z]{3}$/).withMessage('Currency must be a 3-letter ISO 4217 code.'),
    body('salary.period').optional({ nullable: true, checkFalsy: true }).isIn(['month', 'year']),
    salaryMaxAtLeastMin,

    notEmpty(body('description')).isLength({ max: 5000 }).withMessage('Description must not exceed 5000 characters.'),

    body('requiredDocuments').optional({ nullable: true }).isArray().withMessage('requiredDocuments must be an array.'),
    body('requiredDocuments.*').optional().custom(async (value) => {
      const docType = await DocumentType.findOne({ key: value, isActive: true, isRequirableForJob: true }).lean();
      if (!docType) throw new Error(`Invalid or non-requirable document category: ${value}.`);
      return true;
    }),

    optionalDate('joiningDate'),
    optionalDate('applicationDeadline'),

    body('featured').optional({ nullable: true }).isBoolean(),
    body('minimumTier').optional({ nullable: true, checkFalsy: true }).isIn(PLAN_TIERS).withMessage('Invalid minimum tier.'),
  ];
};

// ── POST /admin/jobs ──────────────────────────────────────────────────────────
// Only 'draft' or 'published' make sense as an INITIAL status — 'archived'
// is only reachable via a transition on an existing job (PATCH /:id/status,
// see updateStatus below).

const createJob = [
  ...sharedFieldRules(true),
  body('status').optional({ nullable: true }).isIn(['draft', 'published']).withMessage('Initial status must be draft or published.'),
];

// ── PATCH /admin/jobs/:id ─────────────────────────────────────────────────────

const updateJob = sharedFieldRules(false);

// ── PATCH /admin/jobs/:id/status ──────────────────────────────────────────────

const updateStatus = [
  body('status').notEmpty().isIn(JOB_STATUSES).withMessage('Invalid job status.'),
];

// ── :id param ─────────────────────────────────────────────────────────────────

const jobIdParam = [
  param('id').isMongoId().withMessage('Invalid job ID.'),
];

// ── GET /jobs (public) & GET /admin/jobs query params ─────────────────────────

const minMaxSalaryCheck = query('maxSalary')
  .optional({ nullable: true, checkFalsy: true })
  .custom((value, { req }) => {
    const min = req.query?.minSalary;
    if (min != null && value != null && Number(value) < Number(min)) {
      throw new Error('maxSalary must be greater than or equal to minSalary.');
    }
    return true;
  });

// Accepts a comma-separated list of values, letting the mobile Filter
// modal's multi-select chips (Department, Vessel Type) map directly onto one
// query param each. Shape-only (not checked against JobTaxonomy) — an
// unrecognized filter value just yields zero matching jobs, which is not a
// data-integrity risk, and this is the highest-traffic public endpoint in
// the app, so a per-request DB round-trip here isn't worth it (unlike the
// low-frequency job create/update payload, which IS validated against
// JobTaxonomy above).
const csvShape = (maxLen = 100) => (value) => {
  const tokens = String(value).split(',').map((v) => v.trim()).filter(Boolean);
  if (!tokens.length || !tokens.every((t) => t.length <= maxLen)) {
    throw new Error('Invalid value.');
  }
  return true;
};

const listJobsQuery = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('search').optional().trim().isLength({ max: 200 }),
  query('department').optional().custom(csvShape()),
  query('category').optional().custom(csvShape()),
  query('rank').optional().trim().isLength({ max: 100 }),
  query('vesselType').optional().custom(csvShape()),
  query('country').optional().trim().isLength({ max: 100 }),
  query('employmentType').optional().isIn(JOB_EMPLOYMENT_TYPES),
  query('minSalary').optional().isFloat({ min: 0 }),
  query('maxSalary').optional().isFloat({ min: 0 }),
  minMaxSalaryCheck,
  query('featured').optional().isBoolean(),
  query('sort').optional().isIn(['newest', 'salary']),
];

const listAdminJobsQuery = [
  ...listJobsQuery,
  query('status').optional().isIn(JOB_STATUSES),
];

module.exports = {
  createJob,
  updateJob,
  updateStatus,
  jobIdParam,
  listJobsQuery,
  listAdminJobsQuery,
};
