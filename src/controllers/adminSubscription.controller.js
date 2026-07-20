'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/apiResponse');
const subscriptionService = require('../services/subscription.service');
const { AUTH_MESSAGES } = require('../constants/messages');

// GET /admin/subscriptions/analytics — stats row, revenue-by-tier donut, and
// recent-subscribers table for the admin Subscriptions page.
const getAnalytics = asyncHandler(async (req, res) => {
  const data = await subscriptionService.getAdminAnalytics();
  return successResponse(res, AUTH_MESSAGES.SUBSCRIPTION_ANALYTICS_FETCHED, data);
});

module.exports = { getAnalytics };
