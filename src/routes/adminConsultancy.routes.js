'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/authorize.middleware');
const requireSection = require('../middleware/requireSection.middleware');
const validate = require('../middleware/validate.middleware');
const { ROLES } = require('../constants/roles');
const adminConsultancyController = require('../controllers/adminConsultancy.controller');
const adminConsultancyValidation = require('../validations/adminConsultancy.validation');

router.use(authenticate, authorize(ROLES.ADMIN), requireSection('consultancy'));

router.get('/config', adminConsultancyController.getConfig);
router.patch('/config/fee', validate(adminConsultancyValidation.setFeeBody), adminConsultancyController.setFee);

router.patch('/schedule', validate(adminConsultancyValidation.updateScheduleBody), adminConsultancyController.updateSchedule);

router.get('/bookings', validate(adminConsultancyValidation.listBookingsQuery), adminConsultancyController.listBookings);
router.get('/bookings/:id', validate(adminConsultancyValidation.bookingIdParam), adminConsultancyController.getBookingById);
router.patch(
  '/bookings/:id/status',
  validate([...adminConsultancyValidation.bookingIdParam, ...adminConsultancyValidation.updateBookingStatus]),
  adminConsultancyController.updateBookingStatus
);

module.exports = router;
