'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const { supportPublicLimiter } = require('../middleware/rateLimiter.middleware');
const supportInquiryController = require('../controllers/supportInquiry.controller');
const supportInquiryValidation = require('../validations/supportInquiry.validation');

// Registered BEFORE router.use(authenticate) below — a blocked/logged-out
// user (or the Auth-stack Help & Support menu) has no valid session and
// must be able to reach this without a token.
router.post(
  '/public',
  supportPublicLimiter,
  validate(supportInquiryValidation.createPublicInquiry),
  supportInquiryController.createPublic
);

router.use(authenticate);

router.post('/', validate(supportInquiryValidation.createInquiry), supportInquiryController.create);

module.exports = router;
