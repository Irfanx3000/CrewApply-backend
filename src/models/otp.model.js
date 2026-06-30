'use strict';

const mongoose = require('mongoose');
const { OTP_PURPOSES } = require('../constants/otp');

const otpSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: [true, 'Phone number is required.'],
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

// Fast lookup by phone + purpose (one active OTP per phone per purpose)
otpSchema.index({ phone: 1, purpose: 1 });

module.exports = mongoose.model('Otp', otpSchema);