'use strict';

const geoService = require('../services/geo.service');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/apiResponse');
const { AUTH_MESSAGES } = require('../constants/messages');

const getCities = asyncHandler(async (req, res) => {
  const cities = geoService.getCitiesOfState(req.query.country, req.query.state);
  return successResponse(res, AUTH_MESSAGES.CITIES_FETCHED, { cities });
});

module.exports = { getCities };
