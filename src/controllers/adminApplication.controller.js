'use strict';

const applicationService = require('../services/application.service');
const auditService = require('../services/audit.service');
const notificationService = require('../services/notification.service');
const emailService = require('../services/email.service');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse, paginationMeta } = require('../utils/apiResponse');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');
const { AUDIT_EVENTS } = require('../constants/audit');
const { STATUS_NOTIFICATION_COPY } = require('../constants/applicationStatusCopy');

const listAdminApplications = asyncHandler(async (req, res) => {
  const { applications, page, limit, total } = await applicationService.listAdminApplications(req.query);

  return successResponse(
    res,
    AUTH_MESSAGES.APPLICATIONS_FETCHED,
    { applications },
    HTTP_STATUS.OK,
    paginationMeta(page, limit, total)
  );
});

const getAdminApplicationById = asyncHandler(async (req, res) => {
  const application = await applicationService.getAdminApplicationById(req.params.id);

  if (!application) {
    throw new AppError(AUTH_MESSAGES.APPLICATION_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  return successResponse(res, AUTH_MESSAGES.APPLICATION_FETCHED, { application });
});

const updateApplicationStatus = asyncHandler(async (req, res) => {
  const application = await applicationService.updateApplicationStatus(req.params.id, req.body.status);

  await auditService.log({
    event: AUDIT_EVENTS.APPLICATION_STATUS_CHANGED,
    userId: req.user._id,
    metadata: { applicationId: application.id, status: application.status },
  });

  if (application.applicant?.id) {
    const copy = STATUS_NOTIFICATION_COPY[application.status];
    if (copy) {
      await notificationService.create({
        userId: application.applicant.id,
        type: notificationService.NOTIFICATION_TYPES.APPLICATION_STATUS_CHANGED,
        title: copy.title,
        body: copy.body(application.job?.title ?? 'this position'),
        data: { applicationId: application.id, jobId: application.job?.id ?? null, status: application.status },
      });
    }
  }

  // Fire-and-forget, same as the SMS send in auth.service.js's register() —
  // a slow/failed SMTP send must never delay or break the status update itself.
  if (application.applicant?.email) {
    emailService
      .sendApplicationStatusEmail({
        to: application.applicant.email,
        name: application.applicant.name,
        jobTitle: application.job?.title ?? 'this position',
        status: application.status,
      })
      .catch((err) => {
        console.error('AdminApplicationController: status email failed:', err.message);
      });
  }

  return successResponse(res, AUTH_MESSAGES.APPLICATION_STATUS_UPDATED, { application });
});

module.exports = {
  listAdminApplications,
  getAdminApplicationById,
  updateApplicationStatus,
};
