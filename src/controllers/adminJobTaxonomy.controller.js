'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/apiResponse');
const jobTaxonomyService = require('../services/jobTaxonomy.service');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

// All admin-only (guarded by authorize(ROLES.ADMIN) in the route).

const listAdminJobTaxonomies = asyncHandler(async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true';
  const jobTaxonomies = await jobTaxonomyService.listAll(req.query.type, includeInactive);
  return successResponse(res, AUTH_MESSAGES.JOB_TAXONOMIES_FETCHED, { jobTaxonomies });
});

const getAdminJobTaxonomyById = asyncHandler(async (req, res) => {
  const jobTaxonomy = await jobTaxonomyService.getById(req.params.id);
  return successResponse(res, AUTH_MESSAGES.JOB_TAXONOMY_FETCHED, { jobTaxonomy });
});

const createJobTaxonomy = asyncHandler(async (req, res) => {
  const jobTaxonomy = await jobTaxonomyService.create(req.body, req.user._id);
  return successResponse(res, AUTH_MESSAGES.JOB_TAXONOMY_CREATED, { jobTaxonomy }, HTTP_STATUS.CREATED);
});

const updateJobTaxonomy = asyncHandler(async (req, res) => {
  const jobTaxonomy = await jobTaxonomyService.update(req.params.id, req.body, req.user._id);
  return successResponse(res, AUTH_MESSAGES.JOB_TAXONOMY_UPDATED, { jobTaxonomy });
});

const deactivateJobTaxonomy = asyncHandler(async (req, res) => {
  const jobTaxonomy = await jobTaxonomyService.deactivate(req.params.id, req.user._id);
  return successResponse(res, AUTH_MESSAGES.JOB_TAXONOMY_DEACTIVATED, { jobTaxonomy });
});

const uploadIcon = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError(AUTH_MESSAGES.NO_FILE_UPLOADED, HTTP_STATUS.BAD_REQUEST, 'NO_FILE_UPLOADED');
  }

  const relativePath = await jobTaxonomyService.uploadIcon(req.file);
  const url = `${req.protocol}://${req.get('host')}/${relativePath}`;

  return successResponse(res, AUTH_MESSAGES.JOB_TAXONOMY_ICON_UPLOADED, { url }, HTTP_STATUS.CREATED);
});

module.exports = {
  listAdminJobTaxonomies,
  getAdminJobTaxonomyById,
  createJobTaxonomy,
  updateJobTaxonomy,
  deactivateJobTaxonomy,
  uploadIcon,
};
