'use strict';

const mongoose = require('mongoose');

// Singleton document (exactly one row, upserted) holding admin-configurable
// pricing-related settings that don't belong to any single Plan. Currently just
// the yearly-discount marketing badge override — see subscription.service.js's
// computeMaxYearlySavingsPercent for the auto-computed fallback used when this
// is null.
const pricingSettingSchema = new mongoose.Schema(
  {
    yearlyDiscountOverridePercent: { type: Number, default: null, min: 0, max: 100 },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model('PricingSetting', pricingSettingSchema);
