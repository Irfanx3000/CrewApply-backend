'use strict';

const express = require('express');
const router = express.Router();

const validate = require('../middleware/validate.middleware');
const { generalLimiter } = require('../middleware/rateLimiter.middleware');
const geoController = require('../controllers/geo.controller');
const geoValidation = require('../validations/geo.validation');

// Public — no auth. Reached from account-creation step 2, before a session
// exists, same reasoning as banner.routes.js.
router.get('/cities', generalLimiter, validate(geoValidation.getCities), geoController.getCities);

module.exports = router;
