'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { successResponse, paginationMeta } = require('../utils/apiResponse');
const supportInquiryService = require('../services/supportInquiry.service');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

const listInquiries = asyncHandler(async (req, res) => {
  const { inquiries, page, limit, total } = await supportInquiryService.listAdminInquiries(req.query);
  return successResponse(res, AUTH_MESSAGES.SUPPORT_INQUIRIES_FETCHED, { inquiries }, HTTP_STATUS.OK, paginationMeta(page, limit, total));
});

const getInquiryById = asyncHandler(async (req, res) => {
  const inquiry = await supportInquiryService.getAdminInquiryById(req.params.id);
  return successResponse(res, AUTH_MESSAGES.SUPPORT_INQUIRY_FETCHED, { inquiry });
});

const updateInquiryStatus = asyncHandler(async (req, res) => {
  const { status, reply } = req.body;
  const inquiry = await supportInquiryService.updateInquiryStatus(req.params.id, { status, reply }, req.user._id, req);
  return successResponse(res, AUTH_MESSAGES.SUPPORT_INQUIRY_STATUS_UPDATED, { inquiry });
});

module.exports = { listInquiries, getInquiryById, updateInquiryStatus };
