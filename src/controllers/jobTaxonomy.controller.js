'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/apiResponse');
const jobTaxonomyService = require('../services/jobTaxonomy.service');
const { AUTH_MESSAGES } = require('../constants/messages');

// Public — only currently active values for the given type. No auth required:
// department/vessel-type lists are non-sensitive reference data that already
// ship in public client bundles today, and GET /jobs itself is fully public.
const listActiveJobTaxonomies = asyncHandler(async (req, res) => {
  const jobTaxonomies = await jobTaxonomyService.listActive(req.query.type);
  return successResponse(res, AUTH_MESSAGES.JOB_TAXONOMIES_FETCHED, { jobTaxonomies });
});

module.exports = { listActiveJobTaxonomies };
