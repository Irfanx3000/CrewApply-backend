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
  SUBSCRIPTION_EXPIRING: 'SUBSCRIPTION_EXPIRING',
});

// Created via notifyAdmins() — describe someone ELSE's action (a new user
// registering, a new support ticket, a new application, etc.), never the
// recipient's own event. These must never reach a mobile push notification,
// even for an account that also holds the admin role — only the admin PANEL
// (which reads the in-app list directly, unfiltered) should surface them. A
// phone push would leak another user's activity onto the admin's lock
// screen regardless of whether they're currently "in admin mode" on that
// device. See notification.service.js#create's push gate.
const ADMIN_ONLY_TYPES = Object.freeze([
  NOTIFICATION_TYPES.USER_REGISTERED,
  NOTIFICATION_TYPES.APPLICATION_SUBMITTED,
  NOTIFICATION_TYPES.CONSULTANCY_BOOKING_CREATED,
  NOTIFICATION_TYPES.SUBSCRIPTION_PURCHASED,
  NOTIFICATION_TYPES.SUPPORT_INQUIRY_CREATED,
]);

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

// Outer safety-net ceiling, NOT the actual per-user expiry — MongoDB TTL
// indexes are collection-wide (one duration for everyone), so this can't
// enforce each user's own 5/10/15-day preference directly. Set to 15 (the
// longest option) so nothing is ever physically deleted before a user who
// chose the longest window would expect; the real per-user "disappears
// sooner" behavior is a query-time filter in notification.service.js
// (listForUser/getUnreadCount/getUnreadCountsByType), driven by
// User.notificationExpiryDays. Bumped from 10 — changing this value alone
// does NOT alter an already-existing index on a live database; it must be
// dropped/recreated there too (see the deployment note in the PR/plan).
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 15 * 24 * 60 * 60 });

module.exports = mongoose.model('Notification', notificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
module.exports.ADMIN_ONLY_TYPES = ADMIN_ONLY_TYPES;
