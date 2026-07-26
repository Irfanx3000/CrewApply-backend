'use strict';

const mongoose = require('mongoose');

// Admin-manageable Department / Vessel Type / Category lists for job
// postings — replaces the old hardcoded JOB_DEPARTMENTS/JOB_VESSEL_TYPES
// enums in job.model.js. One shared collection (not several) since all three
// concepts are structurally identical: a named, admin-manageable list.
// `type` distinguishes them. `category` is the one type that also carries an
// `icon` (see below) — it's the taxonomy backing the mobile app's home-screen
// "Categories" section, which needs something visual per entry; department/
// vesselType simply leave `icon` at its defaults, unused.
const JOB_TAXONOMY_TYPES = Object.freeze(['department', 'vesselType', 'category']);

// A built-in icon key (e.g. 'deck') maps to a bundled SVG asset shipped with
// the mobile app (see CrewApply/src/components/home/CategoryCard.jsx) — no
// network fetch, crisp at any size. 'custom' means the admin uploaded their
// own image instead (see jobTaxonomy.service.js#uploadIcon), rendered via a
// plain <Image> from `imageUrl`. An admin who creates a new category without
// uploading anything gets `{type:'default', key:'generic'}` — the mobile
// app's fallback icon for any key it doesn't recognize.
const iconSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: { values: ['default', 'custom'], message: 'Invalid icon type.' },
      default: 'default',
    },
    key: {
      type: String,
      default: 'generic',
    },
    imageUrl: {
      type: String,
      default: null,
    },
  },
  { _id: false }
);

const jobTaxonomySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: [true, 'Type is required.'],
      enum: { values: JOB_TAXONOMY_TYPES, message: 'Invalid taxonomy type.' },
      immutable: true,
    },

    // The exact string stored on Job.department/Job.vesselType — no separate
    // slug/code, so existing Job documents and existing filter/query code
    // (which already sends/stores this exact label) need zero migration.
    // Immutable — renaming would silently orphan the string already saved on
    // existing Job documents; fix a typo by deactivating and creating a
    // corrected entry instead.
    name: {
      type: String,
      required: [true, 'Name is required.'],
      trim: true,
      maxlength: [100, 'Name must not exceed 100 characters.'],
      immutable: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    sortOrder: {
      type: Number,
      default: 0,
    },

    icon: {
      type: iconSchema,
      default: () => ({}),
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Case-insensitive uniqueness per type so "Deck" and "deck" can't coexist.
jobTaxonomySchema.index(
  { type: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);
jobTaxonomySchema.index({ type: 1, isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('JobTaxonomy', jobTaxonomySchema);
module.exports.JOB_TAXONOMY_TYPES = JOB_TAXONOMY_TYPES;
