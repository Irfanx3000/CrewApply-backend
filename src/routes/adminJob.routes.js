'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/authorize.middleware');
const requireSection = require('../middleware/requireSection.middleware');
const validate = require('../middleware/validate.middleware');
const { jobImageUpload } = require('../middleware/upload.middleware');
const { ROLES } = require('../constants/roles');
const adminJobController = require('../controllers/adminJob.controller');
const jobValidation = require('../validations/job.validation');

router.use(authenticate, authorize(ROLES.ADMIN), requireSection('jobs'));

router.get('/', validate(jobValidation.listAdminJobsQuery), adminJobController.listAdminJobs);
router.post('/', validate(jobValidation.createJob), adminJobController.createJob);
router.post('/upload-image', jobImageUpload.single('file'), adminJobController.uploadImage);
router.get('/:id', validate(jobValidation.jobIdParam), adminJobController.getAdminJobById);
router.get('/:id/stats', validate(jobValidation.jobIdParam), adminJobController.getJobStats);
router.patch('/:id', validate([...jobValidation.jobIdParam, ...jobValidation.updateJob]), adminJobController.updateJob);
router.patch('/:id/status', validate([...jobValidation.jobIdParam, ...jobValidation.updateStatus]), adminJobController.updateStatus);
router.delete('/:id', validate(jobValidation.jobIdParam), adminJobController.deleteJob);

module.exports = router;
