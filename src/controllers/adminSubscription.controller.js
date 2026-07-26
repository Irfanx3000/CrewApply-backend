'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { successResponse, paginationMeta } = require('../utils/apiResponse');
const subscriptionService = require('../services/subscription.service');
const { AUTH_MESSAGES } = require('../constants/messages');

// GET /admin/subscriptions/analytics — stats row, revenue-by-tier donut, and
// recent-subscribers table for the admin Subscriptions page.
const getAnalytics = asyncHandler(async (req, res) => {
  const data = await subscriptionService.getAdminAnalytics();
  return successResponse(res, AUTH_MESSAGES.SUBSCRIPTION_ANALYTICS_FETCHED, data);
});

// GET /admin/subscriptions — full paginated subscriber list backing the
// Subscriptions page's "View All" modal (analytics only ever returns the 5
// most recent).
const listSubscriptions = asyncHandler(async (req, res) => {
  const { subscriptions, page, limit, total } = await subscriptionService.listAdminSubscriptions(req.query);
  return successResponse(res, AUTH_MESSAGES.SUBSCRIPTIONS_FETCHED, { subscriptions }, 200, paginationMeta(page, limit, total));
});

module.exports = { getAnalytics, listSubscriptions };
