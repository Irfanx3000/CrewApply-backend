'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const jobController = require('../controllers/job.controller');
const jobValidation = require('../validations/job.validation');

router.use(authenticate);

router.get('/', validate(jobValidation.listJobsQuery), jobController.listJobAlerts);

module.exports = router;
