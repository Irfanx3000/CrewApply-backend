'use strict';

const path = require('path');
const JobTaxonomy = require('../models/jobTaxonomy.model');
const auditService = require('./audit.service');
const { convertToWebp } = require('../utils/image.util');
const { assertRealFileType, deleteTempFile } = require('../utils/uploadGuard.util');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');
const { AUDIT_EVENTS } = require('../constants/audit');

// Admin-only management of the Department / Vessel Type / Category
// catalogue, mirroring documentType.service.js's shape (one shared
// collection, `type` distinguishes department vs vesselType vs category).

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

const ALLOWED_UPDATE_FIELDS = ['isActive', 'sortOrder', 'icon'];

const pick = (source, fields) =>
  fields.reduce((acc, field) => {
    if (Object.prototype.hasOwnProperty.call(source, field)) acc[field] = source[field];
    return acc;
  }, {});

const listActive = (type) =>
  JobTaxonomy.find({ type, isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();

const listAll = (type, includeInactive) => {
  const filter = includeInactive ? { type } : { type, isActive: true };
  return JobTaxonomy.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
};

const getById = async (id) => {
  const taxonomy = await JobTaxonomy.findById(id).lean();
  if (!taxonomy) {
    throw new AppError(AUTH_MESSAGES.JOB_TAXONOMY_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }
  return taxonomy;
};

const create = async (body, adminId) => {
  const exists = await JobTaxonomy.findOne({ type: body.type, name: body.name }).collation({
    locale: 'en',
    strength: 2,
  });
  if (exists) {
    throw new AppError(AUTH_MESSAGES.JOB_TAXONOMY_EXISTS, HTTP_STATUS.CONFLICT, 'JOB_TAXONOMY_EXISTS');
  }

  const taxonomy = await JobTaxonomy.create({
    type: body.type,
    name: body.name,
    ...pick(body, ['sortOrder', 'icon']),
    createdBy: adminId,
  });

  auditService
    .log({ event: AUDIT_EVENTS.JOB_TAXONOMY_CREATED, userId: adminId, metadata: { jobTaxonomyId: taxonomy._id, type: taxonomy.type, name: taxonomy.name } })
    .catch(() => {});
  return taxonomy;
};

const update = async (id, body, adminId) => {
  const taxonomy = await JobTaxonomy.findById(id);
  if (!taxonomy) {
    throw new AppError(AUTH_MESSAGES.JOB_TAXONOMY_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  Object.assign(taxonomy, pick(body, ALLOWED_UPDATE_FIELDS));
  taxonomy.updatedBy = adminId;
  await taxonomy.save();

  auditService
    .log({ event: AUDIT_EVENTS.JOB_TAXONOMY_UPDATED, userId: adminId, metadata: { jobTaxonomyId: taxonomy._id, type: taxonomy.type, name: taxonomy.name } })
    .catch(() => {});
  return taxonomy;
};

// Soft-deactivate only — never hard-delete a value that existing Jobs reference.
const deactivate = async (id, adminId) => {
  const taxonomy = await JobTaxonomy.findByIdAndUpdate(
    id,
    { $set: { isActive: false, updatedBy: adminId } },
    { new: true }
  );
  if (!taxonomy) {
    throw new AppError(AUTH_MESSAGES.JOB_TAXONOMY_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  auditService
    .log({ event: AUDIT_EVENTS.JOB_TAXONOMY_DEACTIVATED, userId: adminId, metadata: { jobTaxonomyId: taxonomy._id, type: taxonomy.type, name: taxonomy.name } })
    .catch(() => {});
  return taxonomy;
};

// Uploads a custom category icon image, converts to WebP (small/square —
// icons render at a fraction of a banner's size), and returns the relative
// path to store as `icon.imageUrl`. Mirrors banner.service.js#uploadBannerImage.
const uploadIcon = async (file) => {
  assertRealFileType(file.path, IMAGE_MIMES);

  const outputFilename = `${path.parse(file.filename).name}.webp`;
  const outputPath = path.join(path.dirname(file.path), '..', 'category-icons', outputFilename);

  await convertToWebp(file.path, outputPath, {
    resize: { width: 256, height: 256, fit: 'inside', withoutEnlargement: true },
  });
  deleteTempFile(file.path);

  return `uploads/category-icons/${outputFilename}`;
};

module.exports = {
  listActive,
  listAll,
  getById,
  create,
  update,
  deactivate,
  uploadIcon,
};
