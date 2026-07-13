'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/apiResponse');
const subscriptionService = require('../services/subscription.service');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

// GET /subscription/plans — public catalogue (auth required)
const getPlans = asyncHandler(async (req, res) => {
  const data = await subscriptionService.getActivePlans();
  return successResponse(res, AUTH_MESSAGES.PLANS_FETCHED, data);
});

// POST /subscription/order — create (or reuse) a Razorpay order. No amount from client.
const createOrder = asyncHandler(async (req, res) => {
  const { tier, billingCycle } = req.body;
  const data = await subscriptionService.createOrder({ user: req.user, tier, billingCycle }, req);
  return successResponse(res, AUTH_MESSAGES.ORDER_CREATED, data, HTTP_STATUS.CREATED);
});

// POST /subscription/verify — client-side confirmation (signature-verified)
const verify = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const data = await subscriptionService.verifyPayment(
    { user: req.user, orderId: razorpay_order_id, paymentId: razorpay_payment_id, signature: razorpay_signature },
    req
  );
  return successResponse(res, AUTH_MESSAGES.PAYMENT_VERIFIED, data);
});

// GET /subscription/me — current subscription (with lazy expiry)
const me = asyncHandler(async (req, res) => {
  const data = await subscriptionService.getMySubscription(req.user._id);
  return successResponse(res, AUTH_MESSAGES.SUBSCRIPTION_FETCHED, data);
});

module.exports = { getPlans, createOrder, verify, me };
