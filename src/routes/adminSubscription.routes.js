'use strict';

const express = require('express');
const router = express.Router();

const adminSubscriptionController = require('../controllers/adminSubscription.controller');
const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/authorize.middleware');
const validate = require('../middleware/validate.middleware');
const adminSubscriptionValidation = require('../validations/adminSubscription.validation');
const { ROLES } = require('../constants/roles');

// Admin-only subscriber analytics for the Subscriptions page.
router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/analytics', adminSubscriptionController.getAnalytics);
router.get('/', validate(adminSubscriptionValidation.listSubscriptionsQuery), adminSubscriptionController.listSubscriptions);

module.exports = router;
