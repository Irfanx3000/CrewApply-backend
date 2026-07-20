'use strict';

const savedJobService = require('../services/savedJob.service');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/apiResponse');
const { AUTH_MESSAGES } = require('../constants/messages');
const { HTTP_STATUS } = require('../constants/httpStatus');

const listSavedJobs = asyncHandler(async (req, res) => {
  const jobs = await savedJobService.listSavedJobs(req.user._id);
  return successResponse(res, AUTH_MESSAGES.SAVED_JOBS_FETCHED, { jobs });
});

const saveJob = asyncHandler(async (req, res) => {
  await savedJobService.saveJob(req.user._id, req.params.jobId);
  return successResponse(res, AUTH_MESSAGES.JOB_SAVED, null, HTTP_STATUS.CREATED);
});

const removeSavedJob = asyncHandler(async (req, res) => {
  await savedJobService.removeSavedJob(req.user._id, req.params.jobId);
  return successResponse(res, AUTH_MESSAGES.JOB_UNSAVED);
});

module.exports = { listSavedJobs, saveJob, removeSavedJob };
