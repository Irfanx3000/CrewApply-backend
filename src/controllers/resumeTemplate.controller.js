'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/apiResponse');
const resumeTemplateService = require('../services/resumeTemplate.service');
const { AUTH_MESSAGES } = require('../constants/messages');

// Authenticated (any role) — the template gallery. Unlike job-taxonomies,
// resume templates are only ever relevant post-login, so this doesn't need
// to be fully public.
const listActiveResumeTemplates = asyncHandler(async (req, res) => {
  const templates = await resumeTemplateService.listActive();
  return successResponse(res, AUTH_MESSAGES.RESUME_TEMPLATES_FETCHED, { templates });
});

const getResumeTemplateById = asyncHandler(async (req, res) => {
  const template = await resumeTemplateService.getById(req.params.id);
  return successResponse(res, AUTH_MESSAGES.RESUME_TEMPLATE_FETCHED, { template });
});

module.exports = { listActiveResumeTemplates, getResumeTemplateById };
