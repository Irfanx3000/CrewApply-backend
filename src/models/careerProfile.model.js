'use strict';

const mongoose = require('mongoose');

// Career Profile — the single source of truth for a seafarer's professional
// identity. Only NATIVE sections (nothing CrewApply already collects
// elsewhere) live here: Experience, Education, Skills, Languages, References,
// plus a top-level career objective. Personal/Contact/Maritime/Certificates
// are deliberately NOT duplicated here — they're read live from User/
// maritimeProfile/Document at request time by careerProfileAggregation.service.js,
// so an edit made once (e.g. phone number) is correct everywhere forever,
// with no "refresh" step. See the architecture doc for the full rationale.

// The native array sections a user can add/update/remove entries in.
const ARRAY_FIELDS = Object.freeze(['experience', 'education', 'skills', 'languages', 'references', 'customSections']);

const SKILL_LEVELS = Object.freeze(['Beginner', 'Intermediate', 'Expert']);
const LANGUAGE_PROFICIENCIES = Object.freeze(['Basic', 'Conversational', 'Fluent', 'Native']);
const CUSTOM_SECTION_TYPES = Object.freeze(['text', 'list', 'timeline']);

const experienceEntrySchema = new mongoose.Schema(
  {
    role: { type: String, required: [true, 'Role is required.'], trim: true, maxlength: 150 },
    vesselName: { type: String, trim: true, default: null, maxlength: 150 },
    // Free string matching JobTaxonomy(type:'vesselType').name values — not
    // enum-constrained at the schema level, same reasoning as Job.vesselType.
    vesselType: { type: String, trim: true, default: null, maxlength: 100 },
    company: { type: String, trim: true, default: null, maxlength: 150 },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    isCurrent: { type: Boolean, default: false },
    // Array-of-String has no native per-item `maxlength` option in Mongoose
    // — enforced here instead, mirroring careerProfile.validation.js's
    // express-validator check (defense-in-depth, same as every other field
    // in this schema pairing a maxlength with a validation-layer check).
    responsibilities: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => arr.length <= 15 && arr.every((item) => typeof item === 'string' && item.length <= 300),
        message: 'Each responsibility must be at most 300 characters, and at most 15 responsibilities are allowed.',
      },
    },
    location: { type: String, trim: true, default: null, maxlength: 150 },
  },
  { timestamps: true }
);

const educationEntrySchema = new mongoose.Schema(
  {
    institution: { type: String, required: [true, 'Institution is required.'], trim: true, maxlength: 150 },
    degree: { type: String, trim: true, default: null, maxlength: 150 },
    fieldOfStudy: { type: String, trim: true, default: null, maxlength: 150 },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    location: { type: String, trim: true, default: null, maxlength: 150 },
    description: { type: String, trim: true, default: null, maxlength: 1000 },
  },
  { timestamps: true }
);

const skillEntrySchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Skill name is required.'], trim: true, maxlength: 100 },
    level: { type: String, enum: { values: SKILL_LEVELS, message: 'Invalid skill level.' }, default: null },
    category: { type: String, trim: true, default: null, maxlength: 50 },
  },
  { timestamps: true }
);

const languageEntrySchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Language name is required.'], trim: true, maxlength: 50 },
    proficiency: {
      type: String,
      enum: { values: LANGUAGE_PROFICIENCIES, message: 'Invalid language proficiency.' },
      default: 'Conversational',
    },
  },
  { timestamps: true }
);

const referenceEntrySchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Reference name is required.'], trim: true, maxlength: 100 },
    relationship: { type: String, trim: true, default: null, maxlength: 100 },
    company: { type: String, trim: true, default: null, maxlength: 150 },
    phone: { type: String, trim: true, default: null, maxlength: 30 },
    email: { type: String, trim: true, default: null, maxlength: 150 },
  },
  { timestamps: true }
);

// Deliberate extensibility hatch — unlike the sections above, content stays
// loosely typed so a new section idea (or an AI-added one) doesn't force a
// migration every time.
const customSectionEntrySchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Title is required.'], trim: true, maxlength: 100 },
    type: { type: String, enum: { values: CUSTOM_SECTION_TYPES, message: 'Invalid custom section type.' }, default: 'text' },
    content: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

// Per-section 0-100 completeness, rolled into `overall` via configured
// weights (see careerProfile.service.js). Aggregated sections (personal/
// contact/maritime/certificates) are scored here too even though their DATA
// lives on User/Document — this is a cached snapshot recomputed on read,
// not a second source of truth.
const completionSchema = new mongoose.Schema(
  {
    overall: { type: Number, default: 0, min: 0, max: 100 },
    sections: {
      personal: { type: Number, default: 0, min: 0, max: 100 },
      contact: { type: Number, default: 0, min: 0, max: 100 },
      maritime: { type: Number, default: 0, min: 0, max: 100 },
      certificates: { type: Number, default: 0, min: 0, max: 100 },
      experience: { type: Number, default: 0, min: 0, max: 100 },
      education: { type: Number, default: 0, min: 0, max: 100 },
      skills: { type: Number, default: 0, min: 0, max: 100 },
      languages: { type: Number, default: 0, min: 0, max: 100 },
      references: { type: Number, default: 0, min: 0, max: 100 },
    },
    computedAt: { type: Date, default: null },
  },
  { _id: false }
);

const careerProfileSchema = new mongoose.Schema(
  {
    // One Career Profile per user.
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    // Native fields — genuinely new content with no other home in the platform.
    careerObjective: { type: String, trim: true, default: null, maxlength: 1000 },
    experience: { type: [experienceEntrySchema], default: [] },
    education: { type: [educationEntrySchema], default: [] },
    skills: { type: [skillEntrySchema], default: [] },
    languages: { type: [languageEntrySchema], default: [] },
    references: { type: [referenceEntrySchema], default: [] },
    customSections: { type: [customSectionEntrySchema], default: [] },

    completion: { type: completionSchema, default: () => ({}) },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model('CareerProfile', careerProfileSchema);
module.exports.ARRAY_FIELDS = ARRAY_FIELDS;
module.exports.SKILL_LEVELS = SKILL_LEVELS;
module.exports.LANGUAGE_PROFICIENCIES = LANGUAGE_PROFICIENCIES;
module.exports.CUSTOM_SECTION_TYPES = CUSTOM_SECTION_TYPES;
