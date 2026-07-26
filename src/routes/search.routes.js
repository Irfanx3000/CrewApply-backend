'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const { searchLimiter } = require('../middleware/rateLimiter.middleware');
const searchController = require('../controllers/search.controller');
const searchValidation = require('../validations/search.validation');

router.use(authenticate);

router.get('/', searchLimiter, validate(searchValidation.search), searchController.appSearch);

module.exports = router;
