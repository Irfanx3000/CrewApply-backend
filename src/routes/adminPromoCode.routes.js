'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/authorize.middleware');
const requireSection = require('../middleware/requireSection.middleware');
const validate = require('../middleware/validate.middleware');
const { ROLES } = require('../constants/roles');
const adminPromoCodeController = require('../controllers/adminPromoCode.controller');
const adminPromoCodeValidation = require('../validations/adminPromoCode.validation');

router.use(authenticate, authorize(ROLES.ADMIN), requireSection('influencers'));

router.get('/', validate(adminPromoCodeValidation.listQuery), adminPromoCodeController.listPromoCodes);

// /stats MUST stay above /:id — both are one path segment and Express matches
// in registration order (same caveat noted in adminReferral.routes.js).
router.get('/stats', adminPromoCodeController.getPromoCodeStats);

router.post('/', validate(adminPromoCodeValidation.createPromoCode), adminPromoCodeController.createPromoCode);

router.get(
  '/:id',
  validate([...adminPromoCodeValidation.idParam, ...adminPromoCodeValidation.listQuery]),
  adminPromoCodeController.getPromoCodeDetail
);

router.patch(
  '/:id',
  validate([...adminPromoCodeValidation.idParam, ...adminPromoCodeValidation.updatePromoCode]),
  adminPromoCodeController.updatePromoCode
);

// Deactivate rather than delete — past conversions must keep resolving.
router.delete('/:id', validate(adminPromoCodeValidation.idParam), adminPromoCodeController.deactivatePromoCode);

module.exports = router;
