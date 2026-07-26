'use strict';

const mongoose = require('mongoose');

// Promotional banner shown in the mobile app (currently: My Applications
// screen). Admin manages a list of these; the mobile app only ever fetches
// the ACTIVE ones, sorted by `order`, and renders them as a carousel — a
// single banner is just a one-slide carousel, no special-casing needed.
const bannerSchema = new mongoose.Schema(
  {
    imageUrl: {
      type: String,
      required: [true, 'Banner image is required.'],
    },

    // Optional tap-through destination (opened via the device's browser/
    // Linking — there's no in-app deep-link routing convention yet).
    linkUrl: {
      type: String,
      trim: true,
      default: null,
    },

    active: {
      type: Boolean,
      default: true,
    },

    // Lower sorts first. Plain manually-set number rather than drag-reorder —
    // matches the scale of this feature (a handful of banners, not hundreds).
    order: {
      type: Number,
      default: 0,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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

bannerSchema.index({ active: 1, order: 1 });

module.exports = mongoose.model('Banner', bannerSchema);
