'use strict';

const bannerService = require('../services/banner.service');
const auditService = require('../services/audit.service');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/apiResponse');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');
const { AUDIT_EVENTS } = require('../constants/audit');

const listAdminBanners = asyncHandler(async (req, res) => {
  const banners = await bannerService.listAdminBanners();
  return successResponse(res, AUTH_MESSAGES.BANNERS_FETCHED, { banners });
});

const createBanner = asyncHandler(async (req, res) => {
  const banner = await bannerService.createBanner(req.body, req.user._id);

  await auditService.log({
    event: AUDIT_EVENTS.BANNER_CREATED,
    userId: req.user._id,
    metadata: { bannerId: banner.id },
  });

  return successResponse(res, AUTH_MESSAGES.BANNER_CREATED, { banner }, HTTP_STATUS.CREATED);
});

const updateBanner = asyncHandler(async (req, res) => {
  const banner = await bannerService.updateBanner(req.params.id, req.body, req.user._id);

  await auditService.log({
    event: AUDIT_EVENTS.BANNER_UPDATED,
    userId: req.user._id,
    metadata: { bannerId: banner.id },
  });

  return successResponse(res, AUTH_MESSAGES.BANNER_UPDATED, { banner });
});

const deleteBanner = asyncHandler(async (req, res) => {
  const banner = await bannerService.deleteBanner(req.params.id);

  await auditService.log({
    event: AUDIT_EVENTS.BANNER_DELETED,
    userId: req.user._id,
    metadata: { bannerId: banner.id },
  });

  return successResponse(res, AUTH_MESSAGES.BANNER_DELETED, { banner });
});

const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError(AUTH_MESSAGES.NO_FILE_UPLOADED, HTTP_STATUS.BAD_REQUEST, 'NO_FILE_UPLOADED');
  }

  const relativePath = await bannerService.uploadBannerImage(req.file);
  const url = `${req.protocol}://${req.get('host')}/${relativePath}`;

  return successResponse(res, AUTH_MESSAGES.BANNER_IMAGE_UPLOADED, { url }, HTTP_STATUS.CREATED);
});

module.exports = {
  listAdminBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  uploadImage,
};
