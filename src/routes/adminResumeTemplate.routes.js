'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/authorize.middleware');
const validate = require('../middleware/validate.middleware');
const { ROLES } = require('../constants/roles');
const adminResumeTemplateController = require('../controllers/adminResumeTemplate.controller');
const resumeTemplateValidation = require('../validations/resumeTemplate.validation');

// Admin-only resume-template (presentation config) management.
router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/', validate(resumeTemplateValidation.listQuery), adminResumeTemplateController.listAdminResumeTemplates);
router.post('/', validate(resumeTemplateValidation.createResumeTemplate), adminResumeTemplateController.createResumeTemplate);
router.get('/:id', validate(resumeTemplateValidation.resumeTemplateIdParam), adminResumeTemplateController.getAdminResumeTemplateById);
router.patch(
  '/:id',
  validate([...resumeTemplateValidation.resumeTemplateIdParam, ...resumeTemplateValidation.updateResumeTemplate]),
  adminResumeTemplateController.updateResumeTemplate
);
router.delete('/:id', validate(resumeTemplateValidation.resumeTemplateIdParam), adminResumeTemplateController.deactivateResumeTemplate);

module.exports = router;
