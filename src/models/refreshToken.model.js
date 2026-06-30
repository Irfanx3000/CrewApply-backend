'use strict';

const mongoose = require('mongoose');
const { config } = require('../config');

const refreshTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // SHA-256 hash of the raw token sent to the client — never store the raw token.
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },

    // Device / session context for audit display.
    userAgent: {
      type: String,
      default: null,
    },

    ipAddress: {
      type: String,
      default: null,
    },

    // When this token expires — MongoDB TTL index deletes the document automatically.
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },

    isRevoked: {
      type: Boolean,
      default: false,
    },

    // Tracks token family for rotation; set when this token is superseded.
    replacedByTokenHash: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Compound index for the most common query: look up a token hash for an active user.
refreshTokenSchema.index({ userId: 1, isRevoked: 1 });

/**
 * Builds the expiry date from the config refresh token lifetime.
 *
 * @returns {Date}
 */
refreshTokenSchema.statics.buildExpiresAt = function () {
  return new Date(Date.now() + config.jwt.refreshExpiresInDays * 24 * 60 * 60 * 1000);
};

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
