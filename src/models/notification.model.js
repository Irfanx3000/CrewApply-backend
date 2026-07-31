'use strict';

const mongoose = require('mongoose');

const NOTIFICATION_TYPES = Object.freeze({
  APPLICATION_STATUS_CHANGED: 'APPLICATION_STATUS_CHANGED',
  APPLICATION_SUBMITTED: 'APPLICATION_SUBMITTED',
  SUBSCRIPTION_PURCHASED: 'SUBSCRIPTION_PURCHASED',
  USER_REGISTERED: 'USER_REGISTERED',
  SAVED_JOB_UNAVAILABLE: 'SAVED_JOB_UNAVAILABLE',
  REFERRAL_JOINED: 'REFERRAL_JOINED',
  REFERRAL_REWARDED: 'REFERRAL_REWARDED',
  NEW_JOB_MATCH: 'NEW_JOB_MATCH',
  CONSULTANCY_BOOKING_CREATED: 'CONSULTANCY_BOOKING_CREATED',
  CONSULTANCY_BOOKING_CONFIRMED: 'CONSULTANCY_BOOKING_CONFIRMED',
  CONSULTANCY_BOOKING_REJECTED: 'CONSULTANCY_BOOKING_REJECTED',
  SUPPORT_INQUIRY_CREATED: 'SUPPORT_INQUIRY_CREATED',
  SUPPORT_INQUIRY_UPDATED: 'SUPPORT_INQUIRY_UPDATED',
});

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    type: {
      type: String,
      required: true,
      enum: Object.values(NOTIFICATION_TYPES),
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    body: {
      type: String,
      required: true,
      trim: true,
    },

    // Arbitrary event-specific payload (applicationId, jobId, status, …) so the
    // mobile app can deep-link on tap without a second fetch, and so future
    // notification types don't require a schema migration.
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    read: {
      type: Boolean,
      default: false,
      index: true,
    },

    readAt: {
      type: Date,
      default: null,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

// Primary query: "this user's notifications, newest first".
notificationSchema.index({ user: 1, createdAt: -1 });
// Fast unread-count lookups.
notificationSchema.index({ user: 1, read: 1 });

// Auto-delete after 10 days so the collection never accumulates junk.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 10 * 24 * 60 * 60 });

module.exports = mongoose.model('Notification', notificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
