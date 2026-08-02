'use strict';

const adminUserService = require('../services/adminUser.service');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse, paginationMeta } = require('../utils/apiResponse');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

const listUsers = asyncHandler(async (req, res) => {
  const { users, page, limit, total } = await adminUserService.listAdminUsers(req.query);
  return successResponse(res, AUTH_MESSAGES.USERS_FETCHED, { users }, HTTP_STATUS.OK, paginationMeta(page, limit, total));
});

const getUserById = asyncHandler(async (req, res) => {
  const user = await adminUserService.getAdminUserById(req.params.id);
  if (!user) {
    throw new AppError(AUTH_MESSAGES.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }
  return successResponse(res, AUTH_MESSAGES.USER_FETCHED, { user });
});

const updateUserStatus = asyncHandler(async (req, res) => {
  const user = await adminUserService.setStatus(req.params.id, req.body.status, req.body.reason, req.user._id, req);
  return successResponse(res, AUTH_MESSAGES.USER_STATUS_UPDATED, { user });
});

module.exports = { listUsers, getUserById, updateUserStatus };
