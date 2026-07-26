'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/apiResponse');
const resumeTemplateService = require('../services/resumeTemplate.service');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

// All admin-only (guarded by authorize(ROLES.ADMIN) in the route).

const listAdminResumeTemplates = asyncHandler(async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true';
  const templates = await resumeTemplateService.listAll(includeInactive);
  return successResponse(res, AUTH_MESSAGES.RESUME_TEMPLATES_FETCHED, { templates });
});

const getAdminResumeTemplateById = asyncHandler(async (req, res) => {
  const template = await resumeTemplateService.getById(req.params.id);
  return successResponse(res, AUTH_MESSAGES.RESUME_TEMPLATE_FETCHED, { template });
});

const createResumeTemplate = asyncHandler(async (req, res) => {
  const template = await resumeTemplateService.create(req.body, req.user._id);
  return successResponse(res, AUTH_MESSAGES.RESUME_TEMPLATE_CREATED, { template }, HTTP_STATUS.CREATED);
});

const updateResumeTemplate = asyncHandler(async (req, res) => {
  const template = await resumeTemplateService.update(req.params.id, req.body, req.user._id);
  return successResponse(res, AUTH_MESSAGES.RESUME_TEMPLATE_UPDATED, { template });
});

const deactivateResumeTemplate = asyncHandler(async (req, res) => {
  const template = await resumeTemplateService.deactivate(req.params.id, req.user._id);
  return successResponse(res, AUTH_MESSAGES.RESUME_TEMPLATE_DEACTIVATED, { template });
});

module.exports = {
  listAdminResumeTemplates,
  getAdminResumeTemplateById,
  createResumeTemplate,
  updateResumeTemplate,
  deactivateResumeTemplate,
};
