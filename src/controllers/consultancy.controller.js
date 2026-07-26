'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { successResponse, paginationMeta } = require('../utils/apiResponse');
const consultancyService = require('../services/consultancy.service');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

// GET /consultancy/availability?month=YYYY-MM
const getAvailability = asyncHandler(async (req, res) => {
  const data = await consultancyService.getAvailability({ month: req.query.month });
  return successResponse(res, AUTH_MESSAGES.CONSULTANCY_AVAILABILITY_FETCHED, { dates: data });
});

// GET /consultancy/slots?date=YYYY-MM-DD
const getSlotsForDate = asyncHandler(async (req, res) => {
  const data = await consultancyService.getSlotsForDate(req.query.date);
  return successResponse(res, AUTH_MESSAGES.CONSULTANCY_SLOTS_FETCHED, { slots: data });
});

// POST /consultancy/order — create (or reuse) a Razorpay order for a date+time
// drawn from the recurring weekly schedule. No amount from client.
const createOrder = asyncHandler(async (req, res) => {
  const { date, startTime, topic, requirement, resumeDocumentId } = req.body;
  const data = await consultancyService.createBookingOrder(
    { user: req.user, date, startTime, topic, requirement, resumeDocumentId },
    req
  );
  return successResponse(res, AUTH_MESSAGES.CONSULTANCY_ORDER_CREATED, data, HTTP_STATUS.CREATED);
});

// POST /consultancy/verify — client-side confirmation (signature-verified)
const verify = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const data = await consultancyService.verifyPayment(
    { user: req.user, orderId: razorpay_order_id, paymentId: razorpay_payment_id, signature: razorpay_signature },
    req
  );
  return successResponse(res, AUTH_MESSAGES.CONSULTANCY_PAYMENT_VERIFIED, { booking: data });
});

// GET /consultancy/bookings
const listMyBookings = asyncHandler(async (req, res) => {
  const { bookings, page, limit, total } = await consultancyService.listMyBookings(req.user._id, req.query);
  return successResponse(res, AUTH_MESSAGES.CONSULTANCY_BOOKINGS_FETCHED, { bookings }, HTTP_STATUS.OK, paginationMeta(page, limit, total));
});

// GET /consultancy/bookings/:id
const getMyBookingById = asyncHandler(async (req, res) => {
  const booking = await consultancyService.getMyBookingById(req.user._id, req.params.id);
  return successResponse(res, AUTH_MESSAGES.CONSULTANCY_BOOKING_FETCHED, { booking });
});

module.exports = {
  getAvailability,
  getSlotsForDate,
  createOrder,
  verify,
  listMyBookings,
  getMyBookingById,
};
