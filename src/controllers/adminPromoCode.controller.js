'use strict';

const promoCodeService = require('../services/promoCode.service');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse, paginationMeta } = require('../utils/apiResponse');
const { AUTH_MESSAGES } = require('../constants/messages');

const listPromoCodes = asyncHandler(async (req, res) => {
  const { promoCodes, page, limit, total } = await promoCodeService.listPromoCodes(req.query);
  return successResponse(res, AUTH_MESSAGES.PROMO_CODES_FETCHED, { promoCodes }, 200, paginationMeta(page, limit, total));
});

const getPromoCodeStats = asyncHandler(async (req, res) => {
  const stats = await promoCodeService.getOverallStats();
  return successResponse(res, AUTH_MESSAGES.PROMO_CODES_FETCHED, { stats });
});

// The per-influencer drill-down: the code's own numbers plus a paginated list
// of the users it actually onboarded.
const getPromoCodeDetail = asyncHandler(async (req, res) => {
  const { promoCode, users, page, limit, total } = await promoCodeService.getPromoCodeDetail(req.params.id, req.query);
  return successResponse(res, AUTH_MESSAGES.PROMO_CODE_FETCHED, { promoCode, users }, 200, paginationMeta(page, limit, total));
});

const createPromoCode = asyncHandler(async (req, res) => {
  const promoCode = await promoCodeService.createPromoCode(req.body, req.user._id, req);
  return successResponse(res, AUTH_MESSAGES.PROMO_CODE_CREATED, { promoCode }, 201);
});

const updatePromoCode = asyncHandler(async (req, res) => {
  const promoCode = await promoCodeService.updatePromoCode(req.params.id, req.body, req.user._id, req);
  return successResponse(res, AUTH_MESSAGES.PROMO_CODE_UPDATED, { promoCode });
});

const deactivatePromoCode = asyncHandler(async (req, res) => {
  const promoCode = await promoCodeService.deactivatePromoCode(req.params.id, req.user._id, req);
  return successResponse(res, AUTH_MESSAGES.PROMO_CODE_DEACTIVATED, { promoCode });
});

module.exports = {
  listPromoCodes,
  getPromoCodeStats,
  getPromoCodeDetail,
  createPromoCode,
  updatePromoCode,
  deactivatePromoCode,
};
