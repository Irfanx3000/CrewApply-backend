'use strict';

const express = require('express');
const router = express.Router();

const consultancyController = require('../controllers/consultancy.controller');
const consultancyValidation = require('../validations/consultancy.validation');
const validate = require('../middleware/validate.middleware');
const authenticate = require('../middleware/auth.middleware');
const { paymentLimiter } = require('../middleware/rateLimiter.middleware');

router.use(authenticate);

router.get('/availability', validate(consultancyValidation.getAvailabilityQuery), consultancyController.getAvailability);
router.get('/slots', validate(consultancyValidation.getSlotsQuery), consultancyController.getSlotsForDate);

router.post(
  '/order',
  paymentLimiter,
  validate(consultancyValidation.createOrder),
  consultancyController.createOrder
);

router.post(
  '/verify',
  validate(consultancyValidation.verifyPayment),
  consultancyController.verify
);

router.get('/bookings', validate(consultancyValidation.listMyBookingsQuery), consultancyController.listMyBookings);
router.get('/bookings/:id', validate(consultancyValidation.bookingIdParam), consultancyController.getMyBookingById);

module.exports = router;
