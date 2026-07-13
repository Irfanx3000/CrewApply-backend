'use strict';

const express = require('express');
const router = express.Router();

const validate = require('../middleware/validate.middleware');
const jobController = require('../controllers/job.controller');
const jobValidation = require('../validations/job.validation');

router.get('/', validate(jobValidation.listJobsQuery), jobController.listJobs);
router.get('/:id', validate(jobValidation.jobIdParam), jobController.getJobById);

module.exports = router;
