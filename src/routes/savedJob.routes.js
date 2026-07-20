'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const savedJobController = require('../controllers/savedJob.controller');
const savedJobValidation = require('../validations/savedJob.validation');

router.use(authenticate);

router.get('/', savedJobController.listSavedJobs);
router.post('/:jobId', validate(savedJobValidation.jobIdParam), savedJobController.saveJob);
router.delete('/:jobId', validate(savedJobValidation.jobIdParam), savedJobController.removeSavedJob);

module.exports = router;
