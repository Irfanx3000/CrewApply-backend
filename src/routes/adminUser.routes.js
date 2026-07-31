'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/authorize.middleware');
const requireSection = require('../middleware/requireSection.middleware');
const validate = require('../middleware/validate.middleware');
const { ROLES } = require('../constants/roles');
const adminUserController = require('../controllers/adminUser.controller');
const adminUserValidation = require('../validations/adminUser.validation');

router.use(authenticate, authorize(ROLES.ADMIN), requireSection('users'));

router.get('/', validate(adminUserValidation.listUsersQuery), adminUserController.listUsers);
router.get('/:id', validate(adminUserValidation.idParam), adminUserController.getUserById);
router.patch(
  '/:id/status',
  validate([...adminUserValidation.idParam, ...adminUserValidation.updateUserStatus]),
  adminUserController.updateUserStatus
);

module.exports = router;
