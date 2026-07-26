'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/apiResponse');
const careerProfileService = require('../services/careerProfile.service');
const { AUTH_MESSAGES } = require('../constants/messages');

// GET /user/career-profile — the fully resolved profile (native + live
// aggregated sections + completion %), the single shape the Career Profile
// screen renders directly.
const getCareerProfile = asyncHandler(async (req, res) => {
  const profile = await careerProfileService.getResolvedProfile(req.user._id);
  return successResponse(res, AUTH_MESSAGES.CAREER_PROFILE_FETCHED, { careerProfile: profile });
});

// PATCH /user/career-profile — career objective only (the one native scalar
// field; array sections have their own add/update/remove endpoints below).
const updateCareerObjective = asyncHandler(async (req, res) => {
  await careerProfileService.updateCareerObjective(req.user._id, req.body.careerObjective);
  const profile = await careerProfileService.getResolvedProfile(req.user._id);
  return successResponse(res, AUTH_MESSAGES.CAREER_PROFILE_UPDATED, { careerProfile: profile });
});

// POST /user/career-profile/:section
const addEntry = asyncHandler(async (req, res) => {
  const entry = await careerProfileService.addEntry(req.user._id, req.params.section, req.body);
  return successResponse(res, AUTH_MESSAGES.CAREER_PROFILE_ENTRY_ADDED, { entry }, 201);
});

// PATCH /user/career-profile/:section/:entryId
const updateEntry = asyncHandler(async (req, res) => {
  const entry = await careerProfileService.updateEntry(req.user._id, req.params.section, req.params.entryId, req.body);
  return successResponse(res, AUTH_MESSAGES.CAREER_PROFILE_ENTRY_UPDATED, { entry });
});

// DELETE /user/career-profile/:section/:entryId
const removeEntry = asyncHandler(async (req, res) => {
  await careerProfileService.removeEntry(req.user._id, req.params.section, req.params.entryId);
  return successResponse(res, AUTH_MESSAGES.CAREER_PROFILE_ENTRY_REMOVED, null);
});

module.exports = { getCareerProfile, updateCareerObjective, addEntry, updateEntry, removeEntry };
