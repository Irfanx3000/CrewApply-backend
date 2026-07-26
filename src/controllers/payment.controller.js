'use strict';

const asyncHandler = require('../utils/asyncHandler');
const paymentService = require('../services/payment.service');
const { HTTP_STATUS } = require('../constants/httpStatus');

// POST /payments/webhook — Razorpay server-to-server callback (NO auth).
// req.rawBody is captured by the express.json `verify` hook in app.js so the
// HMAC is computed over the EXACT received bytes (the parsed body is mutated by
// the sanitizer/xss middleware and must not be used for signature verification).
// paymentService dispatches to the right activate* (subscription or
// consultancy) by the Payment's own `type` field — this one webhook URL is
// shared across every kind of purchase.
const webhook = asyncHandler(async (req, res) => {
  const signature = req.get('x-razorpay-signature');
  const rawBody = req.rawBody;
  const result = await paymentService.handleWebhook({ rawBody, signature }, req);
  // Always 200 on a handled event so Razorpay doesn't retry unnecessarily.
  return res.status(HTTP_STATUS.OK).json({ success: true, ...result });
});

module.exports = { webhook };
