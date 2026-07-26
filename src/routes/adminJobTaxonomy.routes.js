'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/authorize.middleware');
const validate = require('../middleware/validate.middleware');
const { categoryIconUpload } = require('../middleware/upload.middleware');
const { ROLES } = require('../constants/roles');
const adminJobTaxonomyController = require('../controllers/adminJobTaxonomy.controller');
const jobTaxonomyValidation = require('../validations/jobTaxonomy.validation');

// Admin-only Department/Vessel Type/Category (job taxonomy) management.
router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/', validate(jobTaxonomyValidation.listQuery), adminJobTaxonomyController.listAdminJobTaxonomies);
router.post('/', validate(jobTaxonomyValidation.createJobTaxonomy), adminJobTaxonomyController.createJobTaxonomy);
router.post('/upload-icon', categoryIconUpload.single('file'), adminJobTaxonomyController.uploadIcon);
router.get('/:id', validate(jobTaxonomyValidation.jobTaxonomyIdParam), adminJobTaxonomyController.getAdminJobTaxonomyById);
router.patch(
  '/:id',
  validate([...jobTaxonomyValidation.jobTaxonomyIdParam, ...jobTaxonomyValidation.updateJobTaxonomy]),
  adminJobTaxonomyController.updateJobTaxonomy
);
router.delete('/:id', validate(jobTaxonomyValidation.jobTaxonomyIdParam), adminJobTaxonomyController.deactivateJobTaxonomy);

module.exports = router;
