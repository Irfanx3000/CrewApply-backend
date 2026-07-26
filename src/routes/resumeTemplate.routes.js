'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const resumeTemplateController = require('../controllers/resumeTemplate.controller');
const resumeTemplateValidation = require('../validations/resumeTemplate.validation');

// Authenticated (any role) — the template gallery. Resume building is only
// ever relevant post-login, unlike job-taxonomies which need to be public.
router.get('/', authenticate, resumeTemplateController.listActiveResumeTemplates);
router.get('/:id', authenticate, validate(resumeTemplateValidation.resumeTemplateIdParam), resumeTemplateController.getResumeTemplateById);

module.exports = router;
