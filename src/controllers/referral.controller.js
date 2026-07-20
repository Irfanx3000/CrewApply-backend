'use strict';

const referralService = require('../services/referral.service');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/apiResponse');
const { AUTH_MESSAGES } = require('../constants/messages');

// GET /user/referral — my code, share text, wallet balance, stats, history.
const getMyReferral = asyncHandler(async (req, res) => {
  const data = await referralService.getMyReferral(req.user);
  return successResponse(res, AUTH_MESSAGES.REFERRAL_FETCHED, data);
});

// POST /user/referral/generate — explicit "Generate Code" action. Idempotent:
// returns the existing code if one was already generated.
const generateReferralCode = asyncHandler(async (req, res) => {
  const code = await referralService.generateCode(req.user);
  return successResponse(res, AUTH_MESSAGES.REFERRAL_CODE_GENERATED, { code });
});

module.exports = { getMyReferral, generateReferralCode };
