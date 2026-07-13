'use strict';

const { body, param } = require('express-validator');

const TIERS = ['start', 'premium', 'elite'];
const CYCLES = ['monthly', 'yearly'];

// POST /subscription/order — { tier, billingCycle } ONLY. Never an amount.
const createOrder = [
  body('tier').isIn(TIERS).withMessage('Invalid plan tier.'),
  body('billingCycle').isIn(CYCLES).withMessage('Invalid billing cycle.'),
];

// POST /subscription/verify — the three fields Razorpay Checkout returns.
const verifyPayment = [
  body('razorpay_order_id').isString().trim().notEmpty().withMessage('razorpay_order_id is required.'),
  body('razorpay_payment_id').isString().trim().notEmpty().withMessage('razorpay_payment_id is required.'),
  body('razorpay_signature').isString().trim().notEmpty().withMessage('razorpay_signature is required.'),
];

// ── Admin plan CRUD ──
const createPlan = [
  body('tier').isIn(TIERS).withMessage('Invalid plan tier.'),
  body('billingCycle').isIn(CYCLES).withMessage('Invalid billing cycle.'),
  body('code').isString().trim().notEmpty().withMessage('code is required.'),
  body('name').isString().trim().notEmpty().withMessage('name is required.'),
  body('amount').isInt({ min: 0 }).withMessage('amount must be a non-negative integer (paise).'),
  body('launchAmount').optional({ nullable: true }).isInt({ min: 0 }).withMessage('launchAmount must be a non-negative integer (paise).'),
  body('intervalDays').isInt({ min: 1 }).withMessage('intervalDays must be a positive integer.'),
  body('features').optional().isArray().withMessage('features must be an array of strings.'),
  body('jobApplicationLimit').optional({ nullable: true }).isInt({ min: 0 }),
  body('subtitle').optional().isString(),
  body('displayOrder').optional().isInt(),
  body('currency').optional().isString(),
  body('isActive').optional().isBoolean(),
];

const updatePlan = [
  param('id').isMongoId().withMessage('Invalid plan id.'),
  body('amount').optional().isInt({ min: 0 }).withMessage('amount must be a non-negative integer (paise).'),
  body('launchAmount').optional({ nullable: true }).isInt({ min: 0 }),
  body('intervalDays').optional().isInt({ min: 1 }),
  body('features').optional().isArray(),
  body('jobApplicationLimit').optional({ nullable: true }).isInt({ min: 0 }),
  body('name').optional().isString().trim().notEmpty(),
  body('subtitle').optional().isString(),
  body('displayOrder').optional().isInt(),
  body('isActive').optional().isBoolean(),
];

const planIdParam = [param('id').isMongoId().withMessage('Invalid plan id.')];

module.exports = { createOrder, verifyPayment, createPlan, updatePlan, planIdParam };
