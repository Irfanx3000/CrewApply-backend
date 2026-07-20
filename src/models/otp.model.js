'use strict';

const mongoose = require('mongoose');
const { OTP_PURPOSES } = require('../constants/otp');

const otpSchema = new mongoose.Schema(
  {
    // Whatever channel the OTP was sent to for a given purpose — an email
    // address today (MOBILE_VERIFICATION now delivers via email), but kept
    // generic since a purpose could target a different channel later.
    identifier: {
      type: String,
      required: [true, 'Identifier is required.'],
      trim: true,
    },

    otpHash: {
      type: String,
      required: true,
      select: false,
    },

    purpose: {
      type: String,
      required: true,
      enum: {
        values: Object.values(OTP_PURPOSES),
        message: 'Invalid OTP purpose.',
      },
    },

    attempts: {
      type: Number,
      default: 0,
    },

    // MongoDB TTL index on this field auto-removes expired documents
    expiresAt: {
      type: Date,
      required: true,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false }
);

// Auto-expire: MongoDB removes the document when expiresAt is reached
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Fast lookup by identifier + purpose (one active OTP per identifier per purpose)
otpSchema.index({ identifier: 1, purpose: 1 });

module.exports = mongoose.model('Otp', otpSchema);