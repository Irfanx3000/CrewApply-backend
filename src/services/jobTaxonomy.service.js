'use strict';

const path = require('path');
const JobTaxonomy = require('../models/jobTaxonomy.model');
const Job = require('../models/job.model');
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

// The admin panel's DTO expects `id`, not Mongoose's `_id` — without this,
// every taxonomy in the admin UI carries `id: undefined`, breaking edit/
// delete/toggle (they PATCH/DELETE `/admin/job-taxonomies/undefined`) and
// React's list keys. Mirrors banner.service.js#presentBanner.
const presentTaxonomy = (taxonomy) => ({
  id: taxonomy._id,
  type: taxonomy.type,
  name: taxonomy.name,
  isActive: taxonomy.isActive,
  sortOrder: taxonomy.sortOrder,
  icon: taxonomy.icon,
  createdAt: taxonomy.createdAt,
  updatedAt: taxonomy.updatedAt,
});

const listActive = (type) =>
  JobTaxonomy.find({ type, isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();

const listAll = async (type, includeInactive) => {
  const filter = includeInactive ? { type } : { type, isActive: true };
  const taxonomies = await JobTaxonomy.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
  return taxonomies.map(presentTaxonomy);
};

const getById = async (id) => {
  const taxonomy = await JobTaxonomy.findById(id).lean();
  if (!taxonomy) {
    throw new AppError(AUTH_MESSAGES.JOB_TAXONOMY_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }
  return presentTaxonomy(taxonomy);
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
  return presentTaxonomy(taxonomy);
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
  return presentTaxonomy(taxonomy);
};

// Hard-delete — permanently removes the entry, unlike `deactivate` above.
// Blocked if any Job still references it (Job.department/category/vesselType
// store the taxonomy's exact `name` string, not an ObjectId — see
// job.model.js), since silently orphaning that string would make those jobs'
// department/category/vesselType look blank in the UI with no way to fix it
// short of a DB edit. The admin has to either reassign/remove those jobs
// first, or use "Deactivate" instead, which hides it going forward without
// touching existing jobs.
const remove = async (id, adminId) => {
  const taxonomy = await JobTaxonomy.findById(id);
  if (!taxonomy) {
    throw new AppError(AUTH_MESSAGES.JOB_TAXONOMY_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  const jobsInUse = await Job.countDocuments({ [taxonomy.type]: taxonomy.name });
  if (jobsInUse > 0) {
    throw new AppError(
      `Can't delete "${taxonomy.name}" — it's still used by ${jobsInUse} job listing${jobsInUse === 1 ? '' : 's'}. Deactivate it instead, or reassign those jobs first.`,
      HTTP_STATUS.CONFLICT,
      'JOB_TAXONOMY_IN_USE'
    );
  }

  await taxonomy.deleteOne();

  auditService
    .log({ event: AUDIT_EVENTS.JOB_TAXONOMY_DELETED, userId: adminId, metadata: { jobTaxonomyId: taxonomy._id, type: taxonomy.type, name: taxonomy.name } })
    .catch(() => {});
  return presentTaxonomy(taxonomy);
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
  remove,
  uploadIcon,
};
