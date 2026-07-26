'use strict';

const { body, query, param } = require('express-validator');
const { CONSULTANCY_TOPICS, isValidTimeString } = require('../constants/consultancy');

const getAvailabilityQuery = [
  query('month').matches(/^\d{4}-\d{2}$/).withMessage('month must be in YYYY-MM format.'),
];

const getSlotsQuery = [
  query('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('date must be in YYYY-MM-DD format.'),
];

// POST /consultancy/order — { date, startTime, topic, requirement?, resumeDocumentId? } ONLY. Never an amount.
const createOrder = [
  body('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('date must be in YYYY-MM-DD format.'),
  body('startTime').custom((value) => isValidTimeString(value)).withMessage('Invalid start time.'),
  body('topic').isIn(CONSULTANCY_TOPICS).withMessage('Invalid topic.'),
  body('requirement').optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 500 }).withMessage('requirement must not exceed 500 characters.'),
  body('resumeDocumentId').optional({ nullable: true, checkFalsy: true }).isMongoId().withMessage('Invalid resume document id.'),
];

// POST /consultancy/verify — the three fields Razorpay Checkout returns.
const verifyPayment = [
  body('razorpay_order_id').isString().trim().notEmpty().withMessage('razorpay_order_id is required.'),
  body('razorpay_payment_id').isString().trim().notEmpty().withMessage('razorpay_payment_id is required.'),
  body('razorpay_signature').isString().trim().notEmpty().withMessage('razorpay_signature is required.'),
];

const listMyBookingsQuery = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
];

const bookingIdParam = [param('id').isMongoId().withMessage('Invalid booking id.')];

module.exports = {
  getAvailabilityQuery,
  getSlotsQuery,
  createOrder,
  verifyPayment,
  listMyBookingsQuery,
  bookingIdParam,
};
