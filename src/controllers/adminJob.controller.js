'use strict';

const jobService = require('../services/job.service');
const auditService = require('../services/audit.service');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse, paginationMeta } = require('../utils/apiResponse');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');
const { AUDIT_EVENTS } = require('../constants/audit');

const listAdminJobs = asyncHandler(async (req, res) => {
  const { jobs, page, limit, total } = await jobService.listAdminJobs(req.query);

  return successResponse(
    res,
    AUTH_MESSAGES.JOBS_FETCHED,
    { jobs },
    HTTP_STATUS.OK,
    paginationMeta(page, limit, total)
  );
});

const getAdminJobById = asyncHandler(async (req, res) => {
  const job = await jobService.getAdminJobById(req.params.id);

  if (!job) {
    throw new AppError(AUTH_MESSAGES.JOB_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  return successResponse(res, AUTH_MESSAGES.JOB_FETCHED, { job });
});

const createJob = asyncHandler(async (req, res) => {
  const job = await jobService.createJob(req.body, req.user._id);

  await auditService.log({
    event: AUDIT_EVENTS.JOB_CREATED,
    userId: req.user._id,
    metadata: { jobId: job._id, title: job.title },
  });

  return successResponse(res, AUTH_MESSAGES.JOB_CREATED, { job }, HTTP_STATUS.CREATED);
});

const updateJob = asyncHandler(async (req, res) => {
  const job = await jobService.updateJob(req.params.id, req.body, req.user._id);

  await auditService.log({
    event: AUDIT_EVENTS.JOB_UPDATED,
    userId: req.user._id,
    metadata: { jobId: job._id },
  });

  return successResponse(res, AUTH_MESSAGES.JOB_UPDATED, { job });
});

const updateStatus = asyncHandler(async (req, res) => {
  const job = await jobService.updateStatus(req.params.id, req.body.status, req.user._id);

  await auditService.log({
    event: AUDIT_EVENTS.JOB_STATUS_CHANGED,
    userId: req.user._id,
    metadata: { jobId: job._id, status: job.status },
  });

  return successResponse(res, AUTH_MESSAGES.JOB_STATUS_UPDATED, { job });
});

const deleteJob = asyncHandler(async (req, res) => {
  const job = await jobService.deleteJob(req.params.id);

  await auditService.log({
    event: AUDIT_EVENTS.JOB_DELETED,
    userId: req.user._id,
    metadata: { jobId: job._id },
  });

  return successResponse(res, AUTH_MESSAGES.JOB_DELETED, { job });
});

module.exports = {
  listAdminJobs,
  getAdminJobById,
  createJob,
  updateJob,
  updateStatus,
  deleteJob,
};
