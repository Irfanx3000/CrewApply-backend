'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/apiResponse');
const resumeConfigurationService = require('../services/resumeConfiguration.service');
const resumeRenderService = require('../services/resumeRender.service');
const auditService = require('../services/audit.service');
const { AUDIT_EVENTS } = require('../constants/audit');
const { AUTH_MESSAGES } = require('../constants/messages');
const { HTTP_STATUS } = require('../constants/httpStatus');

const listResumeConfigurations = asyncHandler(async (req, res) => {
  const resumes = await resumeConfigurationService.list(req.user._id);
  return successResponse(res, AUTH_MESSAGES.RESUME_CONFIGURATIONS_FETCHED, { resumes });
});

const getResumeConfiguration = asyncHandler(async (req, res) => {
  const resume = await resumeConfigurationService.getById(req.user._id, req.params.id);
  return successResponse(res, AUTH_MESSAGES.RESUME_CONFIGURATION_FETCHED, { resume });
});

const createResumeConfiguration = asyncHandler(async (req, res) => {
  const resume = await resumeConfigurationService.create(req.user._id, req.body);
  auditService.log({ event: AUDIT_EVENTS.RESUME_CONFIGURATION_CREATED, userId: req.user._id, metadata: { resumeConfigurationId: resume._id } }).catch(() => {});
  return successResponse(res, AUTH_MESSAGES.RESUME_CONFIGURATION_CREATED, { resume }, HTTP_STATUS.CREATED);
});

const updateResumeConfiguration = asyncHandler(async (req, res) => {
  const resume = await resumeConfigurationService.update(req.user._id, req.params.id, req.body);
  auditService.log({ event: AUDIT_EVENTS.RESUME_CONFIGURATION_UPDATED, userId: req.user._id, metadata: { resumeConfigurationId: resume._id } }).catch(() => {});
  return successResponse(res, AUTH_MESSAGES.RESUME_CONFIGURATION_UPDATED, { resume });
});

const deleteResumeConfiguration = asyncHandler(async (req, res) => {
  await resumeConfigurationService.remove(req.user._id, req.params.id);
  auditService.log({ event: AUDIT_EVENTS.RESUME_CONFIGURATION_DELETED, userId: req.user._id, metadata: { resumeConfigurationId: req.params.id } }).catch(() => {});
  return successResponse(res, AUTH_MESSAGES.RESUME_CONFIGURATION_DELETED, null);
});

// POST /user/resume-configurations/:id/render — the only endpoint that
// actually produces a PDF. Explicit action only, never triggered implicitly.
const renderResumeConfiguration = asyncHandler(async (req, res) => {
  const doc = await resumeRenderService.generate(req.user._id, req.params.id, { format: req.body.format || 'pdf' });
  auditService.log({ event: AUDIT_EVENTS.RESUME_GENERATED, userId: req.user._id, metadata: { resumeConfigurationId: req.params.id, documentId: doc._id } }).catch(() => {});
  return successResponse(res, AUTH_MESSAGES.RESUME_GENERATED, { document: doc }, HTTP_STATUS.CREATED);
});

const getResumeConfigurationHistory = asyncHandler(async (req, res) => {
  const history = await resumeRenderService.getHistory(req.user._id, req.params.id);
  return successResponse(res, AUTH_MESSAGES.RESUME_HISTORY_FETCHED, { history });
});

module.exports = {
  listResumeConfigurations,
  getResumeConfiguration,
  createResumeConfiguration,
  updateResumeConfiguration,
  deleteResumeConfiguration,
  renderResumeConfiguration,
  getResumeConfigurationHistory,
};
