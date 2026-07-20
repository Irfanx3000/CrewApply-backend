'use strict';

const mongoose = require('mongoose');

// Singleton settings doc — exact same shape/pattern as pricingSetting.model.js.
const referralSettingSchema = new mongoose.Schema(
  {
    rewardAmount: { type: Number, default: 5000, min: 0 }, // paise = ₹50
    maxRewardsPerMonth: { type: Number, default: 50, min: 0 }, // 0 = unlimited
    enabled: { type: Boolean, default: true }, // kill-switch
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model('ReferralSetting', referralSettingSchema);
