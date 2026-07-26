'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/authorize.middleware');
const validate = require('../middleware/validate.middleware');
const { searchLimiter } = require('../middleware/rateLimiter.middleware');
const { ROLES } = require('../constants/roles');
const searchController = require('../controllers/search.controller');
const searchValidation = require('../validations/search.validation');

router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/', searchLimiter, validate(searchValidation.search), searchController.adminSearch);

module.exports = router;
