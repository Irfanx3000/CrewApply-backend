'use strict';

const mongoose = require('mongoose');

const APPLICATION_STATUSES = Object.freeze([
  'applied',
  'under_review',
  'interview_scheduled',
  'selected',
  'rejected',
  'withdrawn',
]);

const submittedDocumentSchema = new mongoose.Schema(
  {
    category: { type: String, required: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  },
  { _id: false }
);

const applicationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: { values: APPLICATION_STATUSES, message: 'Invalid application status.' },
      default: 'applied',
    },

    // Snapshot of which active Document satisfied each of the job's required
    // categories at apply-time — survives the user later archiving/replacing it.
    submittedDocuments: { type: [submittedDocumentSchema], default: [] },

    withdrawnAt: { type: Date, default: null },
    statusUpdatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// One application per user per job — no re-apply after withdrawal in v1.
applicationSchema.index({ user: 1, job: 1 }, { unique: true });
applicationSchema.index({ user: 1, createdAt: -1 }); // "My Applications" listing
applicationSchema.index({ job: 1, createdAt: -1 });  // future admin per-job review

module.exports = mongoose.model('Application', applicationSchema);
module.exports.APPLICATION_STATUSES = APPLICATION_STATUSES;
