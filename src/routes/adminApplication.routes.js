'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/authorize.middleware');
const validate = require('../middleware/validate.middleware');
const { ROLES } = require('../constants/roles');
const adminApplicationController = require('../controllers/adminApplication.controller');
const applicationValidation = require('../validations/application.validation');

router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/', validate(applicationValidation.listAdminApplicationsQuery), adminApplicationController.listAdminApplications);
router.get('/:id', validate(applicationValidation.idParam), adminApplicationController.getAdminApplicationById);
router.patch(
  '/:id/status',
  validate([...applicationValidation.idParam, ...applicationValidation.updateApplicationStatus]),
  adminApplicationController.updateApplicationStatus
);

module.exports = router;
