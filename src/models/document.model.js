'use strict';

const mongoose = require('mongoose');

const DOCUMENT_STATUSES = Object.freeze([
  'active',
  'archived',
  'pending_verification',
  'verified',
  'rejected',
]);

const documentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // References DocumentType.key — validated dynamically at the request layer
    // (see documentType.service.js) rather than a static schema enum, since the
    // set of valid categories is now admin-configurable.
    category: {
      type: String,
      required: true,
      trim: true,
    },

    // Sub-type within a category — e.g. 'COC', 'GMDSS', 'Basic Safety' for stcw
    type: {
      type: String,
      trim: true,
      default: null,
    },

    originalName: {
      type: String,
      required: true,
      trim: true,
    },

    storedName: {
      type: String,
      required: true,
    },

    path: {
      type: String,
      required: true,
    },

    mimeType: {
      type: String,
      required: true,
    },

    size: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: { values: DOCUMENT_STATUSES, message: 'Invalid document status.' },
      default: 'active',
    },

    // Flexible per-category metadata (issueDate, expiryDate, passportNumber, etc.)
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Distinguishes a user-uploaded file from one produced by the Resume
    // rendering engine — lets "upload your own resume" and "build one from
    // your Career Profile" coexist as the same Document/category, per the
    // Career Profile Engine design.
    source: {
      type: String,
      enum: { values: ['uploaded', 'generated'], message: 'Invalid document source.' },
      default: 'uploaded',
    },

    // Provenance for a generated document — null for uploaded ones.
    generatedFrom: {
      resumeConfigurationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ResumeConfiguration', default: null },
      templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ResumeTemplate', default: null },
      version: { type: Number, default: null },
      // Whether the free-tier watermark was burned into this file. Decided
      // solely by resumeRender.service.js from live subscription state;
      // recorded here so the file's status is auditable without re-parsing the
      // PDF. Defaults to true so anything created without an explicit decision
      // is treated as the restricted case, never the privileged one.
      watermarked: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Compound indexes for common query patterns
documentSchema.index({ user: 1, category: 1 });
documentSchema.index({ user: 1, category: 1, status: 1 });

module.exports = mongoose.model('Document', documentSchema);
module.exports.DOCUMENT_STATUSES = DOCUMENT_STATUSES;
