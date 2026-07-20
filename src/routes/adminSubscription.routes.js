'use strict';

const express = require('express');
const router = express.Router();

const adminSubscriptionController = require('../controllers/adminSubscription.controller');
const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/authorize.middleware');
const { ROLES } = require('../constants/roles');

// Admin-only subscriber analytics for the Subscriptions page.
router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/analytics', adminSubscriptionController.getAnalytics);

module.exports = router;
