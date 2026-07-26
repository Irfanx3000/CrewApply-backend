'use strict';

const jobService = require('../services/job.service');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse, paginationMeta } = require('../utils/apiResponse');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

const listJobs = asyncHandler(async (req, res) => {
  const { jobs, page, limit, total } = await jobService.listPublicJobs(req.query);

  return successResponse(
    res,
    AUTH_MESSAGES.JOBS_FETCHED,
    { jobs },
    HTTP_STATUS.OK,
    paginationMeta(page, limit, total)
  );
});

const getJobById = asyncHandler(async (req, res) => {
  const job = await jobService.getPublicJobById(req.params.id);

  if (!job) {
    throw new AppError(AUTH_MESSAGES.JOB_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  return successResponse(res, AUTH_MESSAGES.JOB_FETCHED, { job });
});

const listJobAlerts = asyncHandler(async (req, res) => {
  const { jobs, page, limit, total } = await jobService.listJobAlertsForUser(req.user._id, req.query);

  return successResponse(
    res,
    AUTH_MESSAGES.JOBS_FETCHED,
    { jobs },
    HTTP_STATUS.OK,
    paginationMeta(page, limit, total)
  );
});

module.exports = { listJobs, getJobById, listJobAlerts };
