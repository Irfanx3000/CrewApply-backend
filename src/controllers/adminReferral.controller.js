'use strict';

const referralService = require('../services/referral.service');
const referralSettingService = require('../services/referralSetting.service');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse, paginationMeta } = require('../utils/apiResponse');
const { AUTH_MESSAGES } = require('../constants/messages');

const listReferrals = asyncHandler(async (req, res) => {
  const { referrals, page, limit, total } = await referralService.listReferrals(req.query);
  return successResponse(res, AUTH_MESSAGES.REFERRALS_FETCHED, { referrals }, 200, paginationMeta(page, limit, total));
});

const getReferralStats = asyncHandler(async (req, res) => {
  const stats = await referralService.getReferralStats();
  return successResponse(res, AUTH_MESSAGES.REFERRALS_FETCHED, { stats });
});

const updateReferralStatus = asyncHandler(async (req, res) => {
  const referral = await referralService.setReferralStatus(req.params.id, req.body.status, req.user._id, req);
  return successResponse(res, AUTH_MESSAGES.REFERRAL_STATUS_UPDATED, { referral });
});

const getReferralSettings = asyncHandler(async (req, res) => {
  const settings = await referralSettingService.getSettings();
  return successResponse(res, AUTH_MESSAGES.REFERRAL_SETTINGS_FETCHED, { settings });
});

const updateReferralSettings = asyncHandler(async (req, res) => {
  const settings = await referralSettingService.updateSettings(req.body, req.user._id, req);
  return successResponse(res, AUTH_MESSAGES.REFERRAL_SETTINGS_UPDATED, { settings });
});

module.exports = { listReferrals, getReferralStats, updateReferralStatus, getReferralSettings, updateReferralSettings };
