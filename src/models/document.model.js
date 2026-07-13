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
