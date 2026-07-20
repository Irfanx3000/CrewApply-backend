'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/apiResponse');
const planService = require('../services/plan.service');
const pricingSettingService = require('../services/pricingSetting.service');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

// All admin-only (guarded by authorize(ROLES.ADMIN) in the route).

const list = asyncHandler(async (req, res) => {
  return successResponse(res, AUTH_MESSAGES.PLANS_FETCHED, await planService.listAll());
});

const create = asyncHandler(async (req, res) => {
  const plan = await planService.create(req.body, req.user._id, req);
  return successResponse(res, AUTH_MESSAGES.PLAN_CREATED, plan, HTTP_STATUS.CREATED);
});

const update = asyncHandler(async (req, res) => {
  const plan = await planService.update(req.params.id, req.body, req.user._id, req);
  return successResponse(res, AUTH_MESSAGES.PLAN_UPDATED, plan);
});

const deactivate = asyncHandler(async (req, res) => {
  const plan = await planService.deactivate(req.params.id, req.user._id, req);
  return successResponse(res, AUTH_MESSAGES.PLAN_UPDATED, plan);
});

// PATCH /admin/plans/tier/:tier — updates the (monthly, yearly) pair together,
// so the admin UI never has to juggle two separate Mongo _ids for one tier.
const updateTierPricing = asyncHandler(async (req, res) => {
  const plans = await planService.updateTierPricing(req.params.tier, req.body, req.user._id, req);
  return successResponse(res, AUTH_MESSAGES.PLAN_UPDATED, plans);
});

const getPricingSettings = asyncHandler(async (req, res) => {
  const yearlyDiscountOverridePercent = await pricingSettingService.getOverride();
  return successResponse(res, AUTH_MESSAGES.PRICING_SETTINGS_FETCHED, { yearlyDiscountOverridePercent });
});

const updatePricingSettings = asyncHandler(async (req, res) => {
  const percent = req.body.yearlyDiscountOverridePercent ?? null;
  const yearlyDiscountOverridePercent = await pricingSettingService.setOverride(percent, req.user._id, req);
  return successResponse(res, AUTH_MESSAGES.PRICING_SETTINGS_UPDATED, { yearlyDiscountOverridePercent });
});

module.exports = { list, create, update, deactivate, updateTierPricing, getPricingSettings, updatePricingSettings };
