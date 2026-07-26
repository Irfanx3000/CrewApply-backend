'use strict';

const searchService = require('../services/search.service');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/apiResponse');
const { AUTH_MESSAGES } = require('../constants/messages');

const adminSearch = asyncHandler(async (req, res) => {
  const groups = await searchService.runSearch({ query: req.query.q, scope: 'admin' });
  return successResponse(res, AUTH_MESSAGES.SEARCH_RESULTS_FETCHED, { groups });
});

const appSearch = asyncHandler(async (req, res) => {
  const groups = await searchService.runSearch({ query: req.query.q, scope: 'app' });
  return successResponse(res, AUTH_MESSAGES.SEARCH_RESULTS_FETCHED, { groups });
});

module.exports = { adminSearch, appSearch };
