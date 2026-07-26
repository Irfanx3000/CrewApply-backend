'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const careerProfileController = require('../controllers/careerProfile.controller');
const careerProfileValidation = require('../validations/careerProfile.validation');

router.use(authenticate);

router.get('/', careerProfileController.getCareerProfile);
router.patch('/', validate(careerProfileValidation.updateCareerObjective), careerProfileController.updateCareerObjective);

router.post(
  '/:section',
  validate([...careerProfileValidation.sectionParam, ...careerProfileValidation.entryBody]),
  careerProfileController.addEntry
);
router.patch(
  '/:section/:entryId',
  validate([...careerProfileValidation.entryIdParam, ...careerProfileValidation.entryBody]),
  careerProfileController.updateEntry
);
router.delete(
  '/:section/:entryId',
  validate(careerProfileValidation.entryIdParam),
  careerProfileController.removeEntry
);

module.exports = router;
