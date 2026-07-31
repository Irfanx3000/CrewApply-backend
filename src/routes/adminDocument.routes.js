'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/authorize.middleware');
const requireSection = require('../middleware/requireSection.middleware');
const validate = require('../middleware/validate.middleware');
const { ROLES } = require('../constants/roles');
const adminDocumentController = require('../controllers/adminDocument.controller');
const adminDocumentValidation = require('../validations/adminDocument.validation');

// Admin-only document viewing (reviewing an applicant's submitted files).
// Uses normal Bearer-token auth, not the mobile app's scoped view-token
// scheme — a web admin panel can attach a real Authorization header.
// Gated under 'applications' — this is always reached from the Applications
// page's applicant-document review flow.
router.use(authenticate, authorize(ROLES.ADMIN), requireSection('applications'));

router.get('/:id/file', validate(adminDocumentValidation.documentIdParam), adminDocumentController.getDocumentFile);

module.exports = router;
