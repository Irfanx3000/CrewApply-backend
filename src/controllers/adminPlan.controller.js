'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/apiResponse');
const planService = require('../services/plan.service');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

// All admin-only (guarded by authorize(ROLES.ADMIN) in the route).

const list = asyncHandler(async (req, res) => {
  return successResponse(res, AUTH_MESSAGES.PLANS_FETCHED, await planService.listAll());
});

const create = asyncHandler(async (req, res) => {
  const plan = await planService.create(req.body, req.user._id, req);
  return successResponse(res, AUTH_MESSAGES.PLAN_CREATED, plan, HTTP_STATUS.CREATED);
});

const update = asyncHandler(async (req, res) => {
  const plan = await planService.update(req.params.id, req.body, req.user._id, req);
  return successResponse(res, AUTH_MESSAGES.PLAN_UPDATED, plan);
});

const deactivate = asyncHandler(async (req, res) => {
  const plan = await planService.deactivate(req.params.id, req.user._id, req);
  return successResponse(res, AUTH_MESSAGES.PLAN_UPDATED, plan);
});

module.exports = { list, create, update, deactivate };
