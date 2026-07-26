'use strict';

const bannerService = require('../services/banner.service');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/apiResponse');
const { AUTH_MESSAGES } = require('../constants/messages');

const listBanners = asyncHandler(async (req, res) => {
  const banners = await bannerService.listActiveBanners();
  return successResponse(res, AUTH_MESSAGES.BANNERS_FETCHED, { banners });
});

module.exports = { listBanners };
