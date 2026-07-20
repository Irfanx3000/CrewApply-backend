'use strict';

const mongoose = require('mongoose');
const { PLAN_TIERS } = require('./plan.model');

// Mirrors CrewApply/src/constants/maritime.constants.js DEPARTMENTS — keep in sync.
const JOB_DEPARTMENTS = Object.freeze([
  'Deck',
  'Engine',
  'Electrical',
  'Catering / Galley',
  'Hotel / Hospitality',
  'Medical',
]);

// Mirrors CrewApply/src/constants/maritime.constants.js DESIGNATIONS — keep in sync.
const JOB_DESIGNATIONS = Object.freeze([
  'Trainee / Cadet',
  'Rating',
  'Petty Officer',
  'Junior Officer',
  'Senior Officer',
  'Head of Department',
  'Management',
]);

// Mirrors CrewApply/src/constants/maritime.constants.js VESSEL_TYPES — keep in sync.
const JOB_VESSEL_TYPES = Object.freeze([
  'Cruise',
  'Container',
  'Tanker',
  'Bulk Carrier',
  'Offshore',
  'LNG Carrier',
  'LPG Carrier',
  'Chemical Tanker',
  'Ro-Ro',
  'Tug',
]);

const JOB_EMPLOYMENT_TYPES = Object.freeze([
  'Full Time',
  'Part Time',
  'Contract',
  'Internship',
]);

const JOB_STATUSES = Object.freeze([
  'draft',
  'published',
  'archived',
]);

const locationSchema = new mongoose.Schema(
  {
    city: { type: String, trim: true, default: null },
    country: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const experienceSchema = new mongoose.Schema(
  {
    minYears: { type: Number, default: 0, min: 0 },
    maxYears: { type: Number, default: null, min: 0 },
  },
  { _id: false }
);

const salarySchema = new mongoose.Schema(
  {
    min: { type: Number, default: null, min: 0 },
    max: { type: Number, default: null, min: 0 },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO 4217 code.'],
    },
    period: {
      type: String,
      enum: { values: ['month', 'year'], message: 'Salary period must be month or year.' },
      default: 'month',
    },
  },
  { _id: false }
);

const jobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Job title is required.'],
      trim: true,
      maxlength: [150, 'Job title must not exceed 150 characters.'],
    },

    // Descriptive-only — the admin acts as an agent entering jobs on behalf of
    // shipping companies/vessel operators. No Company entity/account exists.
    companyName: {
      type: String,
      required: [true, 'Company name is required.'],
      trim: true,
      maxlength: [150, 'Company name must not exceed 150 characters.'],
    },
    companyLogoUrl: {
      type: String,
      default: null,
    },

    department: {
      type: String,
      required: [true, 'Department is required.'],
      enum: { values: JOB_DEPARTMENTS, message: 'Invalid department.' },
    },

    rank: {
      type: String,
      required: [true, 'Rank is required.'],
      trim: true,
      maxlength: [100, 'Rank must not exceed 100 characters.'],
    },

    designation: {
      type: String,
      enum: { values: JOB_DESIGNATIONS, message: 'Invalid designation.' },
      default: null,
    },

    vesselType: {
      type: String,
      required: [true, 'Vessel type is required.'],
      enum: { values: JOB_VESSEL_TYPES, message: 'Invalid vessel type.' },
    },

    location: {
      type: locationSchema,
      required: true,
    },

    employmentType: {
      type: String,
      required: [true, 'Employment type is required.'],
      enum: { values: JOB_EMPLOYMENT_TYPES, message: 'Invalid employment type.' },
    },

    experience: {
      type: experienceSchema,
      default: () => ({}),
    },

    salary: {
      type: salarySchema,
      default: () => ({}),
    },

    description: {
      type: String,
      required: [true, 'Job description is required.'],
      maxlength: [5000, 'Description must not exceed 5000 characters.'],
    },

    // An applicant must have an active Document in every one of these categories
    // before they're allowed to apply. References DocumentType.key, validated
    // dynamically at the request layer (see job.validation.js) since the set of
    // valid categories is admin-configurable, not a fixed schema enum.
    requiredDocuments: {
      type: [String],
      default: [],
    },

    joiningDate: { type: Date, default: null },

    // Not exposed on the simplified admin form (defaults to null = always
    // open) but actively used server-side: application.service.js gates
    // eligibility on this via jobIsOpenForApplications().
    applicationDeadline: { type: Date, default: null },

    status: {
      type: String,
      enum: { values: JOB_STATUSES, message: 'Invalid job status.' },
      default: 'draft',
    },

    featured: { type: Boolean, default: false },

    // Minimum subscription tier required to apply (see plan.model.js's
    // isTierSufficient). Default 'start' means "any active subscriber can
    // apply" — today's behavior — so existing jobs are unaffected until an
    // admin explicitly tags one as premium/elite-only. Jobs stay visible to
    // everyone regardless of this field; only applying is gated.
    minimumTier: {
      type: String,
      enum: { values: PLAN_TIERS, message: 'Invalid minimum tier.' },
      default: 'start',
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    publishedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// Core public listing query: published jobs, newest first.
jobSchema.index({ status: 1, publishedAt: -1 });
// Featured Jobs section.
jobSchema.index({ status: 1, featured: -1, publishedAt: -1 });
// Equality filters exposed by the mobile Jobs/Filter UI.
jobSchema.index({ status: 1, department: 1 });
jobSchema.index({ status: 1, rank: 1 });
jobSchema.index({ status: 1, vesselType: 1 });
jobSchema.index({ status: 1, 'location.country': 1 });
// Free-text search — no external search infrastructure required.
jobSchema.index({
  title: 'text',
  companyName: 'text',
  department: 'text',
  rank: 'text',
  vesselType: 'text',
  'location.city': 'text',
  'location.country': 'text',
});

module.exports = mongoose.model('Job', jobSchema);
module.exports.JOB_DEPARTMENTS = JOB_DEPARTMENTS;
module.exports.JOB_DESIGNATIONS = JOB_DESIGNATIONS;
module.exports.JOB_VESSEL_TYPES = JOB_VESSEL_TYPES;
module.exports.JOB_EMPLOYMENT_TYPES = JOB_EMPLOYMENT_TYPES;
module.exports.JOB_STATUSES = JOB_STATUSES;
