'use strict';

const applicationService = require('../services/application.service');
const auditService = require('../services/audit.service');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse, paginationMeta } = require('../utils/apiResponse');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');
const { AUDIT_EVENTS } = require('../constants/audit');

const checkEligibility = asyncHandler(async (req, res) => {
  const eligibility = await applicationService.checkEligibility(req.user, req.params.jobId);
  return successResponse(res, AUTH_MESSAGES.ELIGIBILITY_FETCHED, { eligibility });
});

const apply = asyncHandler(async (req, res) => {
  const application = await applicationService.applyToJob(req.user, req.body.jobId);

  await auditService.log({
    event: AUDIT_EVENTS.APPLICATION_CREATED,
    userId: req.user._id,
    metadata: { applicationId: application.id, jobId: req.body.jobId },
  });

  return successResponse(res, AUTH_MESSAGES.APPLICATION_SUBMITTED, { application }, HTTP_STATUS.CREATED);
});

const listMyApplications = asyncHandler(async (req, res) => {
  const { applications, page, limit, total } = await applicationService.listMyApplications(req.user._id, req.query);

  return successResponse(
    res,
    AUTH_MESSAGES.APPLICATIONS_FETCHED,
    { applications },
    HTTP_STATUS.OK,
    paginationMeta(page, limit, total)
  );
});

const getById = asyncHandler(async (req, res) => {
  const application = await applicationService.getMyApplicationById(req.user._id, req.params.id);
  return successResponse(res, AUTH_MESSAGES.APPLICATION_FETCHED, { application });
});

const withdraw = asyncHandler(async (req, res) => {
  const application = await applicationService.withdrawApplication(req.user._id, req.params.id);

  await auditService.log({
    event: AUDIT_EVENTS.APPLICATION_WITHDRAWN,
    userId: req.user._id,
    metadata: { applicationId: application.id },
  });

  return successResponse(res, AUTH_MESSAGES.APPLICATION_WITHDRAWN, { application });
});

module.exports = {
  checkEligibility,
  apply,
  listMyApplications,
  getById,
  withdraw,
};
