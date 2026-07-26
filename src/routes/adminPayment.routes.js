'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/authorize.middleware');
const validate = require('../middleware/validate.middleware');
const { ROLES } = require('../constants/roles');
const adminPaymentController = require('../controllers/adminPayment.controller');
const adminPaymentValidation = require('../validations/adminPayment.validation');

router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/', validate(adminPaymentValidation.listPaymentsQuery), adminPaymentController.listPayments);
router.get('/stats', adminPaymentController.getPaymentStats);

module.exports = router;
