'use strict';

const express = require('express');
const router = express.Router();

const adminPlanController = require('../controllers/adminPlan.controller');
const subscriptionValidation = require('../validations/subscription.validation');
const validate = require('../middleware/validate.middleware');
const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/authorize.middleware');
const { ROLES } = require('../constants/roles');

// Admin-only plan (price/feature) management. Tested via Postman with an admin token
// until the admin panel exists.
router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/', adminPlanController.list);
router.post('/', validate(subscriptionValidation.createPlan), adminPlanController.create);
router.patch('/:id', validate(subscriptionValidation.updatePlan), adminPlanController.update);
router.delete('/:id', validate(subscriptionValidation.planIdParam), adminPlanController.deactivate);

module.exports = router;
