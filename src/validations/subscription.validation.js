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
  body('pricing.india.amount').isInt({ min: 0 }).withMessage('pricing.india.amount must be a non-negative integer (paise).'),
  body('pricing.india.launchAmount').optional({ nullable: true }).isInt({ min: 0 }).withMessage('pricing.india.launchAmount must be a non-negative integer (paise).'),
  body('pricing.global.amount').isInt({ min: 0 }).withMessage('pricing.global.amount must be a non-negative integer (cents).'),
  body('pricing.global.launchAmount').optional({ nullable: true }).isInt({ min: 0 }).withMessage('pricing.global.launchAmount must be a non-negative integer (cents).'),
  body('intervalDays').isInt({ min: 1 }).withMessage('intervalDays must be a positive integer.'),
  body('features').optional().isArray().withMessage('features must be an array of strings.'),
  body('jobApplicationLimit').optional({ nullable: true }).isInt({ min: 0 }),
  body('subtitle').optional().isString(),
  body('displayOrder').optional().isInt(),
  body('isActive').optional().isBoolean(),
];

const updatePlan = [
  param('id').isMongoId().withMessage('Invalid plan id.'),
  body('pricing.india.amount').optional().isInt({ min: 0 }).withMessage('pricing.india.amount must be a non-negative integer (paise).'),
  body('pricing.india.launchAmount').optional({ nullable: true }).isInt({ min: 0 }),
  body('pricing.global.amount').optional().isInt({ min: 0 }).withMessage('pricing.global.amount must be a non-negative integer (cents).'),
  body('pricing.global.launchAmount').optional({ nullable: true }).isInt({ min: 0 }),
  body('intervalDays').optional().isInt({ min: 1 }),
  body('features').optional().isArray(),
  body('jobApplicationLimit').optional({ nullable: true }).isInt({ min: 0 }),
  body('name').optional().isString().trim().notEmpty(),
  body('subtitle').optional().isString(),
  body('displayOrder').optional().isInt(),
  body('isActive').optional().isBoolean(),
];

const planIdParam = [param('id').isMongoId().withMessage('Invalid plan id.')];

// PATCH /admin/plans/tier/:tier — updates the (monthly, yearly) pair together.
const tierPricingParam = [param('tier').isIn(TIERS).withMessage('Invalid plan tier.')];

const perCyclePricingBody = (cycle) => [
  body(`${cycle}.pricing.india.amount`).optional().isInt({ min: 0 }).withMessage(`${cycle}.pricing.india.amount must be a non-negative integer (paise).`),
  body(`${cycle}.pricing.india.launchAmount`).optional({ nullable: true }).isInt({ min: 0 }),
  body(`${cycle}.pricing.global.amount`).optional().isInt({ min: 0 }).withMessage(`${cycle}.pricing.global.amount must be a non-negative integer (cents).`),
  body(`${cycle}.pricing.global.launchAmount`).optional({ nullable: true }).isInt({ min: 0 }),
  body(`${cycle}.isActive`).optional().isBoolean(),
];

const updateTierPricing = [
  ...tierPricingParam,
  ...perCyclePricingBody('monthly'),
  ...perCyclePricingBody('yearly'),
];

const pricingSettingBody = [
  body('yearlyDiscountOverridePercent').optional({ nullable: true }).isInt({ min: 0, max: 100 }).withMessage('yearlyDiscountOverridePercent must be an integer between 0 and 100, or null.'),
];

module.exports = {
  createOrder,
  verifyPayment,
  createPlan,
  updatePlan,
  planIdParam,
  updateTierPricing,
  pricingSettingBody,
};
