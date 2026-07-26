'use strict';

const jobService = require('../services/job.service');
const applicationService = require('../services/application.service');
const savedJobService = require('../services/savedJob.service');
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

const getJobStats = asyncHandler(async (req, res) => {
  const job = await jobService.getAdminJobById(req.params.id);
  if (!job) {
    throw new AppError(AUTH_MESSAGES.JOB_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  const stats = await applicationService.getJobApplicationStats(req.params.id);

  return successResponse(res, AUTH_MESSAGES.JOB_STATS_FETCHED, { stats });
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

  // Moving out of 'published' means anyone who saved this job can no longer
  // apply to it — unsave it for them and let them know why it's gone.
  if (job.status !== 'published') {
    savedJobService.notifyAndRemoveUnavailableJob(job).catch(() => {});
  }

  return successResponse(res, AUTH_MESSAGES.JOB_STATUS_UPDATED, { job });
});

const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError(AUTH_MESSAGES.NO_FILE_UPLOADED, HTTP_STATUS.BAD_REQUEST, 'NO_FILE');
  }

  const relativePath = await jobService.uploadJobImage(req.file);
  const url = `${req.protocol}://${req.get('host')}/${relativePath}`;

  return successResponse(res, AUTH_MESSAGES.JOB_IMAGE_UPLOADED, { url }, HTTP_STATUS.CREATED);
});

const deleteJob = asyncHandler(async (req, res) => {
  const job = await jobService.deleteJob(req.params.id);

  await auditService.log({
    event: AUDIT_EVENTS.JOB_DELETED,
    userId: req.user._id,
    metadata: { jobId: job._id },
  });

  // Only draft jobs can reach this point (enforced in jobService.deleteJob),
  // and drafts are never visible/saveable by users — this is a no-op in
  // practice, kept only so saved-jobs cleanup stays symmetric if that
  // business rule ever changes.
  savedJobService.notifyAndRemoveUnavailableJob(job).catch(() => {});

  return successResponse(res, AUTH_MESSAGES.JOB_DELETED, { job });
});

module.exports = {
  listAdminJobs,
  getAdminJobById,
  getJobStats,
  createJob,
  updateJob,
  updateStatus,
  uploadImage,
  deleteJob,
};
