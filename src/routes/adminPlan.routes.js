'use strict';

const express = require('express');
const router = express.Router();

const adminPlanController = require('../controllers/adminPlan.controller');
const subscriptionValidation = require('../validations/subscription.validation');
const validate = require('../middleware/validate.middleware');
const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/authorize.middleware');
const requireSection = require('../middleware/requireSection.middleware');
const { ROLES } = require('../constants/roles');

// Admin-only plan (price/feature) management. Tested via Postman with an admin token
// until the admin panel exists.
router.use(authenticate, authorize(ROLES.ADMIN), requireSection('subscriptions'));

router.get('/', adminPlanController.list);
router.post('/', validate(subscriptionValidation.createPlan), adminPlanController.create);

// Tier-level pricing (monthly + yearly together) and the yearly-discount badge
// setting. /pricing-settings MUST be declared before PATCH /:id — both are a
// single path segment, and Express matches whichever route was registered
// first, so /:id would otherwise swallow "pricing-settings" as if it were a
// plan id. /tier/:tier has no such risk (an extra segment), kept alongside
// these for readability.
router.patch('/tier/:tier', validate(subscriptionValidation.updateTierPricing), adminPlanController.updateTierPricing);
router.get('/pricing-settings', adminPlanController.getPricingSettings);
router.patch('/pricing-settings', validate(subscriptionValidation.pricingSettingBody), adminPlanController.updatePricingSettings);

router.patch('/:id', validate(subscriptionValidation.updatePlan), adminPlanController.update);
router.delete('/:id', validate(subscriptionValidation.planIdParam), adminPlanController.deactivate);

module.exports = router;
