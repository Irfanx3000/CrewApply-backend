'use strict';

const dashboardService = require('../services/dashboard.service');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/apiResponse');
const { AUTH_MESSAGES } = require('../constants/messages');

const getSummary = asyncHandler(async (req, res) => {
  const summary = await dashboardService.getSummary();
  return successResponse(res, AUTH_MESSAGES.DASHBOARD_SUMMARY_FETCHED, summary);
});

const getChart = asyncHandler(async (req, res) => {
  const chart = await dashboardService.getRevenueChart({ metric: req.query.metric, range: req.query.range });
  return successResponse(res, AUTH_MESSAGES.DASHBOARD_CHART_FETCHED, chart);
});

module.exports = { getSummary, getChart };
