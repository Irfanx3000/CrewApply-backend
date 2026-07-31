'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/authorize.middleware');
const requireSection = require('../middleware/requireSection.middleware');
const validate = require('../middleware/validate.middleware');
const { ROLES } = require('../constants/roles');
const adminSupportInquiryController = require('../controllers/adminSupportInquiry.controller');
const supportInquiryValidation = require('../validations/supportInquiry.validation');

router.use(authenticate, authorize(ROLES.ADMIN), requireSection('support'));

router.get('/', validate(supportInquiryValidation.listInquiriesQuery), adminSupportInquiryController.listInquiries);
router.get('/:id', validate(supportInquiryValidation.inquiryIdParam), adminSupportInquiryController.getInquiryById);
router.patch(
  '/:id/status',
  validate([...supportInquiryValidation.inquiryIdParam, ...supportInquiryValidation.updateInquiryStatus]),
  adminSupportInquiryController.updateInquiryStatus
);

module.exports = router;
