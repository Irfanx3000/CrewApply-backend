'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const resumeConfigurationController = require('../controllers/resumeConfiguration.controller');
const resumeConfigurationValidation = require('../validations/resumeConfiguration.validation');

router.use(authenticate);

router.get('/', resumeConfigurationController.listResumeConfigurations);
router.post('/', validate(resumeConfigurationValidation.createResumeConfiguration), resumeConfigurationController.createResumeConfiguration);
router.get('/:id', validate(resumeConfigurationValidation.resumeConfigurationIdParam), resumeConfigurationController.getResumeConfiguration);
router.patch(
  '/:id',
  validate([...resumeConfigurationValidation.resumeConfigurationIdParam, ...resumeConfigurationValidation.updateResumeConfiguration]),
  resumeConfigurationController.updateResumeConfiguration
);
router.delete('/:id', validate(resumeConfigurationValidation.resumeConfigurationIdParam), resumeConfigurationController.deleteResumeConfiguration);

router.post(
  '/:id/render',
  validate([...resumeConfigurationValidation.resumeConfigurationIdParam, ...resumeConfigurationValidation.renderResumeConfiguration]),
  resumeConfigurationController.renderResumeConfiguration
);
router.get('/:id/history', validate(resumeConfigurationValidation.resumeConfigurationIdParam), resumeConfigurationController.getResumeConfigurationHistory);

module.exports = router;
