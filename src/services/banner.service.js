'use strict';

const path = require('path');
const Banner = require('../models/banner.model');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');
const { convertToWebp } = require('../utils/image.util');
const { assertRealFileType, deleteTempFile } = require('../utils/uploadGuard.util');

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

// Fields an admin is allowed to set — never spread req.body directly onto the model.
const ALLOWED_BANNER_FIELDS = ['imageUrl', 'linkUrl', 'active', 'order'];

const pick = (source, fields) =>
  fields.reduce((acc, field) => {
    if (Object.prototype.hasOwnProperty.call(source, field)) acc[field] = source[field];
    return acc;
  }, {});

// ── Public (mobile) ───────────────────────────────────────────────────────────

// Only what the carousel needs — no createdBy/updatedBy/timestamps leaking out.
const presentPublicBanner = (banner) => ({
  id: banner._id,
  imageUrl: banner.imageUrl,
  linkUrl: banner.linkUrl,
});

const listActiveBanners = async () => {
  const banners = await Banner.find({ active: true }).sort({ order: 1, createdAt: -1 }).lean();
  return banners.map(presentPublicBanner);
};

// ── Admin ─────────────────────────────────────────────────────────────────────

const presentBanner = (banner) => ({
  id: banner._id,
  imageUrl: banner.imageUrl,
  linkUrl: banner.linkUrl,
  active: banner.active,
  order: banner.order,
  createdAt: banner.createdAt,
  updatedAt: banner.updatedAt,
});

const listAdminBanners = async () => {
  const banners = await Banner.find({}).sort({ order: 1, createdAt: -1 }).lean();
  return banners.map(presentBanner);
};

const createBanner = async (data, userId) => {
  const banner = await Banner.create({
    ...pick(data, ALLOWED_BANNER_FIELDS),
    createdBy: userId,
  });
  return presentBanner(banner.toObject());
};

const updateBanner = async (id, data, userId) => {
  const banner = await Banner.findById(id);
  if (!banner) {
    throw new AppError(AUTH_MESSAGES.BANNER_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  Object.assign(banner, pick(data, ALLOWED_BANNER_FIELDS));
  banner.updatedBy = userId;
  await banner.save();

  return presentBanner(banner.toObject());
};

const deleteBanner = async (id) => {
  const banner = await Banner.findById(id);
  if (!banner) {
    throw new AppError(AUTH_MESSAGES.BANNER_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }
  await banner.deleteOne();
  return presentBanner(banner.toObject());
};

/**
 * Converts an uploaded banner image to WebP and returns its relative path.
 * Capped at 1600×900 (wider than the job-image cap — banners run full-width),
 * preserving aspect ratio.
 */
const uploadBannerImage = async (file) => {
  assertRealFileType(file.path, IMAGE_MIMES);

  const outputFilename = `${path.parse(file.filename).name}.webp`;
  const outputPath = path.join(path.dirname(file.path), '..', 'banners', outputFilename);

  await convertToWebp(file.path, outputPath, {
    resize: { width: 1600, height: 900, fit: 'inside', withoutEnlargement: true },
  });
  deleteTempFile(file.path);

  return `uploads/banners/${outputFilename}`;
};

module.exports = {
  listActiveBanners,
  listAdminBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  uploadBannerImage,
};
