'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const supportInquiryController = require('../controllers/supportInquiry.controller');
const supportInquiryValidation = require('../validations/supportInquiry.validation');

router.use(authenticate);

router.post('/', validate(supportInquiryValidation.createInquiry), supportInquiryController.create);

module.exports = router;
