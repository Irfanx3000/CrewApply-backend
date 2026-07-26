'use strict';

const subscriptionService = require('../services/subscription.service');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse, paginationMeta } = require('../utils/apiResponse');
const { AUTH_MESSAGES } = require('../constants/messages');

const listPayments = asyncHandler(async (req, res) => {
  const { payments, page, limit, total } = await subscriptionService.listAdminPayments(req.query);
  return successResponse(res, AUTH_MESSAGES.PAYMENTS_FETCHED, { payments }, 200, paginationMeta(page, limit, total));
});

const getPaymentStats = asyncHandler(async (req, res) => {
  const stats = await subscriptionService.getPaymentStats();
  return successResponse(res, AUTH_MESSAGES.PAYMENT_STATS_FETCHED, { stats });
});

module.exports = { listPayments, getPaymentStats };
