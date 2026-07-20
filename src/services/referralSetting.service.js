'use strict';

const ReferralSetting = require('../models/referralSetting.model');
const auditService = require('./audit.service');
const { AUDIT_EVENTS } = require('../constants/audit');

const ctxOf = (req) => ({
  ipAddress: req?.ip || null,
  userAgent: req?.get?.('user-agent') || null,
});

// Singleton settings doc — same upsert pattern as pricingSetting.service.js.
const getOrCreate = async () => {
  const setting = await ReferralSetting.findOneAndUpdate({}, { $setOnInsert: {} }, { new: true, upsert: true });
  return setting;
};

const getSettings = async () => {
  const setting = await getOrCreate();
  return {
    rewardAmount: setting.rewardAmount,
    maxRewardsPerMonth: setting.maxRewardsPerMonth,
    enabled: setting.enabled,
  };
};

const updateSettings = async (patch, adminId, req) => {
  const setting = await getOrCreate();
  if (patch.rewardAmount != null) setting.rewardAmount = patch.rewardAmount;
  if (patch.maxRewardsPerMonth != null) setting.maxRewardsPerMonth = patch.maxRewardsPerMonth;
  if (patch.enabled != null) setting.enabled = patch.enabled;
  await setting.save();

  auditService
    .log({ event: AUDIT_EVENTS.REFERRAL_SETTING_UPDATED, userId: adminId, ...ctxOf(req), metadata: patch })
    .catch(() => {});

  return getSettings();
};

module.exports = { getOrCreate, getSettings, updateSettings };
