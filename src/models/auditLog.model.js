'use strict';

const mongoose = require('mongoose');
const { AUDIT_EVENTS } = require('../constants/audit');

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    event: {
      type: String,
      required: true,
      enum: Object.values(AUDIT_EVENTS),
      index: true,
    },

    ipAddress: {
      type: String,
      default: null,
    },

    userAgent: {
      type: String,
      default: null,
    },

    // Arbitrary event-specific data (e.g. failed email, locked until date).
    metadata: {
      type: mongoose.Schema.Types.Mixed,
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

// Compound index for querying a user's security timeline.
auditLogSchema.index({ userId: 1, createdAt: -1 });

// Automatically expire audit logs after 90 days to manage collection size.
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
