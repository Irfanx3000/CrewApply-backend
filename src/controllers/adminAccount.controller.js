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
  const result = await adminAccountService.inviteAdmin({ email: req.body.email }, req.user._id, req);
  return successResponse(res, AUTH_MESSAGES.ADMIN_INVITE_SENT, result, HTTP_STATUS.CREATED);
});

module.exports = { listAdmins, inviteAdmin };
