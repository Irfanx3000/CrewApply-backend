'use strict';

const asyncHandler = require('../utils/asyncHandler');
const subscriptionService = require('../services/subscription.service');
const { HTTP_STATUS } = require('../constants/httpStatus');

// POST /payments/webhook — Razorpay server-to-server callback (NO auth).
// req.rawBody is captured by the express.json `verify` hook in app.js so the
// HMAC is computed over the EXACT received bytes (the parsed body is mutated by
// the sanitizer/xss middleware and must not be used for signature verification).
const webhook = asyncHandler(async (req, res) => {
  const signature = req.get('x-razorpay-signature');
  const rawBody = req.rawBody;
  const result = await subscriptionService.handleWebhook({ rawBody, signature }, req);
  // Always 200 on a handled event so Razorpay doesn't retry unnecessarily.
  return res.status(HTTP_STATUS.OK).json({ success: true, ...result });
});

module.exports = { webhook };
