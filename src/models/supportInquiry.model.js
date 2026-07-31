'use strict';

const mongoose = require('mongoose');
const { PLAN_TIERS } = require('./plan.model');

const STATUSES = Object.freeze(['new', 'in_progress', 'resolved']);

// User-submitted "Contact Support" requests (mobile app) — admin-managed,
// segregated in the admin panel by the submitter's subscription tier first
// (higher tier surfaces first), then oldest-first within the same tier.
const supportInquirySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Captured from the submission form, not re-read off the User document —
    // the user is explicitly allowed to edit these before submitting (e.g. an
    // alternate contact email), so they can legitimately differ from the
    // account's stored profile.
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 500 },

    // Denormalized at creation time (same reasoning as User.subscriptionTier
    // itself — read with zero extra joins). `subscriptionTierSnapshot` is for
    // display; `priorityRank` is what admin list sorting actually runs on, so
    // no aggregation/lookup is needed to segregate by plan.
    subscriptionTierSnapshot: {
      type: String,
      enum: { values: [...PLAN_TIERS, null], message: 'Invalid subscription tier.' },
      default: null,
    },
    priorityRank: { type: Number, default: 0, index: true },

    status: {
      type: String,
      enum: { values: STATUSES, message: 'Invalid support inquiry status.' },
      default: 'new',
      index: true,
    },

    // Optional message an admin writes when changing status — becomes the
    // body of the in-app notification sent back to the user.
    adminReply: { type: String, trim: true, maxlength: 1000, default: null },
    statusUpdatedAt: { type: Date, default: null },
    statusUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// The exact order the admin list needs — sort directly on these two fields,
// no aggregation required.
supportInquirySchema.index({ priorityRank: -1, createdAt: 1 });
supportInquirySchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('SupportInquiry', supportInquirySchema);
module.exports.STATUSES = STATUSES;
