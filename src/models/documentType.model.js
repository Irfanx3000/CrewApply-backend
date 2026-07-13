'use strict';

const mongoose = require('mongoose');

const ACCEPTED_FILE_TYPES = Object.freeze(['pdf', 'image', 'both']);

const documentTypeSchema = new mongoose.Schema(
  {
    // Stable identifier used as the value stored in Document.category and
    // Job.requiredDocuments — admin-typed, never auto-slugified from `label`
    // (slugifying risks silently mismatching already-seeded/production values).
    key: {
      type: String,
      required: [true, 'Key is required.'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z][a-z0-9_]{1,49}$/, 'Key must be lowercase letters, numbers, or underscores, starting with a letter.'],
      immutable: true,
    },

    label: {
      type: String,
      required: [true, 'Label is required.'],
      trim: true,
      maxlength: [100, 'Label must not exceed 100 characters.'],
    },

    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [300, 'Description must not exceed 300 characters.'],
    },

    acceptedFileTypes: {
      type: String,
      required: [true, 'Accepted file types are required.'],
      enum: { values: ACCEPTED_FILE_TYPES, message: 'acceptedFileTypes must be pdf, image, or both.' },
    },

    maxSizeMB: {
      type: Number,
      required: [true, 'Max size is required.'],
      min: [1, 'Max size must be at least 1 MB.'],
      max: [20, 'Max size must not exceed 20 MB.'],
    },

    // false => uploading a new document of this type archives the previous
    // active one (e.g. passport, resume). true => documents accumulate (e.g.
    // certificates, visas).
    allowMultiple: {
      type: Boolean,
      default: false,
    },

    // Whether an admin can list this category in a Job's requiredDocuments gate.
    // false for account-setup types (profile photo) or catch-all types (others)
    // that shouldn't be used to gate job applications.
    isRequirableForJob: {
      type: Boolean,
      default: true,
    },

    icon: {
      type: String,
      required: [true, 'Icon is required.'],
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    sortOrder: {
      type: Number,
      default: 0,
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

// `key`'s unique index is already created by `unique: true` on the field above.
documentTypeSchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('DocumentType', documentTypeSchema);
module.exports.ACCEPTED_FILE_TYPES = ACCEPTED_FILE_TYPES;
