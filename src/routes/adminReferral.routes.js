'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/authorize.middleware');
const validate = require('../middleware/validate.middleware');
const { ROLES } = require('../constants/roles');
const adminReferralController = require('../controllers/adminReferral.controller');
const adminReferralValidation = require('../validations/adminReferral.validation');

router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/', validate(adminReferralValidation.listReferralsQuery), adminReferralController.listReferrals);
router.get('/stats', adminReferralController.getReferralStats);

// /settings MUST be declared before /:id — both are a single path segment,
// and Express matches whichever route was registered first (same caveat
// already documented in adminPlan.routes.js for /pricing-settings vs /:id).
router.get('/settings', adminReferralController.getReferralSettings);
router.patch('/settings', validate(adminReferralValidation.referralSettingsBody), adminReferralController.updateReferralSettings);

router.patch(
  '/:id/status',
  validate([...adminReferralValidation.idParam, ...adminReferralValidation.updateReferralStatus]),
  adminReferralController.updateReferralStatus
);

module.exports = router;
