'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const { requireActiveSubscription } = require('../middleware/subscription.middleware');
const validate = require('../middleware/validate.middleware');
const applicationController = require('../controllers/application.controller');
const applicationValidation = require('../validations/application.validation');

router.use(authenticate);

router.get('/', validate(applicationValidation.listQuery), applicationController.listMyApplications);

// Must work even when the user is ineligible — no subscription gate here.
router.get('/eligibility/:jobId', validate(applicationValidation.jobIdParam), applicationController.checkEligibility);

router.post('/', requireActiveSubscription, validate(applicationValidation.apply), applicationController.apply);

router.get('/:id', validate(applicationValidation.idParam), applicationController.getById);
router.post('/:id/withdraw', validate(applicationValidation.idParam), applicationController.withdraw);

module.exports = router;
