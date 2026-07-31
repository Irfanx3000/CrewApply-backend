'use strict';

const adminAccountService = require('../services/adminAccount.service');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/apiResponse');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

const listAdmins = asyncHandler(async (req, res) => {
  const admins = await adminAccountService.listAdmins();
  return successResponse(res, AUTH_MESSAGES.ADMINS_FETCHED, { admins });
});

const inviteAdmin = asyncHandler(async (req, res) => {
  const result = await adminAccountService.inviteAdmin(
    { email: req.body.email, confirm: req.body.confirm === true, permissions: req.body.permissions },
    req.user._id,
    req,
  );

  // Not yet an actual invite — the frontend shows a confirmation prompt and
  // resubmits with confirm: true, so this isn't the 201 CREATED case below.
  if (result.requiresConfirmation) {
    return successResponse(res, AUTH_MESSAGES.ADMIN_INVITE_CONFIRMATION_REQUIRED, result, HTTP_STATUS.OK);
  }

  return successResponse(res, AUTH_MESSAGES.ADMIN_INVITE_SENT, result, HTTP_STATUS.CREATED);
});

const revokeAdmin = asyncHandler(async (req, res) => {
  const result = await adminAccountService.revokeAdmin(req.params.id, req.user._id, req);
  return successResponse(res, AUTH_MESSAGES.ADMIN_ACCESS_REVOKED, result);
});

const updatePermissions = asyncHandler(async (req, res) => {
  const result = await adminAccountService.updatePermissions(req.params.id, req.body.permissions, req.user._id, req);
  return successResponse(res, AUTH_MESSAGES.ADMIN_PERMISSIONS_UPDATED, result);
});

module.exports = { listAdmins, inviteAdmin, revokeAdmin, updatePermissions };
