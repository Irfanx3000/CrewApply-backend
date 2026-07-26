'use strict';

const express = require('express');
const router = express.Router();

const validate = require('../middleware/validate.middleware');
const jobTaxonomyController = require('../controllers/jobTaxonomy.controller');
const jobTaxonomyValidation = require('../validations/jobTaxonomy.validation');

// Public — no auth. Department/vessel-type lists are non-sensitive reference
// data (GET /jobs itself is public too).
router.get('/', validate(jobTaxonomyValidation.publicListQuery), jobTaxonomyController.listActiveJobTaxonomies);

module.exports = router;
