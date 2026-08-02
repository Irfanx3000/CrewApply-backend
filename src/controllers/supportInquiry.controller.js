'use strict';

const supportInquiryService = require('../services/supportInquiry.service');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/apiResponse');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

const create = asyncHandler(async (req, res) => {
  const inquiry = await supportInquiryService.createInquiry(
    { user: req.user, name: req.body.name, email: req.body.email, message: req.body.message },
    req
  );
  return successResponse(res, AUTH_MESSAGES.SUPPORT_INQUIRY_CREATED, { inquiry }, HTTP_STATUS.CREATED);
});

const createPublic = asyncHandler(async (req, res) => {
  const inquiry = await supportInquiryService.createPublicInquiry(
    { name: req.body.name, email: req.body.email, message: req.body.message },
    req
  );
  return successResponse(res, AUTH_MESSAGES.SUPPORT_INQUIRY_CREATED, { inquiry }, HTTP_STATUS.CREATED);
});

module.exports = { create, createPublic };
