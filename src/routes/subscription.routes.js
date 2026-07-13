'use strict';

const express = require('express');
const router = express.Router();

const subscriptionController = require('../controllers/subscription.controller');
const subscriptionValidation = require('../validations/subscription.validation');
const validate = require('../middleware/validate.middleware');
const authenticate = require('../middleware/auth.middleware');
const { paymentLimiter } = require('../middleware/rateLimiter.middleware');

// All routes require a logged-in user.
router.get('/plans', authenticate, subscriptionController.getPlans);

router.post(
  '/order',
  authenticate,
  paymentLimiter,
  validate(subscriptionValidation.createOrder),
  subscriptionController.createOrder
);

router.post(
  '/verify',
  authenticate,
  validate(subscriptionValidation.verifyPayment),
  subscriptionController.verify
);

router.get('/me', authenticate, subscriptionController.me);

module.exports = router;
