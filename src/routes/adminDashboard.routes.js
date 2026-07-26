'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/authorize.middleware');
const validate = require('../middleware/validate.middleware');
const { ROLES } = require('../constants/roles');
const adminDashboardController = require('../controllers/adminDashboard.controller');
const adminDashboardValidation = require('../validations/adminDashboard.validation');

router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/summary', adminDashboardController.getSummary);
router.get('/chart', validate(adminDashboardValidation.chartQuery), adminDashboardController.getChart);

module.exports = router;
