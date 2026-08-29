'use strict';

const { body, query, param } = require('express-validator');
const { DISCOUNT_TYPES, COMMISSION_TYPES } = require('../models/promoCode.model');

const idParam = [param('id').isMongoId().withMessage('Invalid influencer ID.')];

const listQuery = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('search').optional().trim().isLength({ max: 200 }),
  query('status').optional().isIn(['active', 'inactive']).withMessage('Status must be active or inactive.'),
];

// A promo code is broadcast publicly and every field below decides how much
// money leaves the business per redemption, so this is a trust boundary, not
// a formality — nothing here is optional-by-vibes.
const percentRange = (field, label) =>
  body(field).custom((value, { req }) => {
    const type = req.body[field.replace('Value', 'Type')];
    if (type === 'percent' && (value < 1 || value > 100)) {
      throw new Error(`${label} must be between 1 and 100 when the type is percent.`);
    }
    return true;
  });

const promoFields = (optional) => {
  const maybe = (chain) => (optional ? chain.optional() : chain);

  return [
    // Omit to have one generated from the influencer's name.
    body('code')
      .optional({ checkFalsy: true })
      .trim()
      .toUpperCase()
      .isLength({ min: 4, max: 20 }).withMessage('Promo code must be 4-20 characters.')
      .matches(/^[A-Z0-9]+$/).withMessage('Promo code may only contain letters and numbers.'),

    maybe(body('influencerName').trim().isLength({ min: 2, max: 80 }).withMessage('Influencer name must be 2-80 characters.')),
    maybe(body('influencerEmail').trim().isEmail().withMessage('A valid influencer email is required.').normalizeEmail({ gmail_remove_dots: false, gmail_remove_subaddress: false })),
    body('influencerPhone').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 20 }).withMessage('Phone is too long.'),
    body('notes').optional({ nullable: true }).trim().isLength({ max: 500 }).withMessage('Notes are too long.'),

    maybe(body('discountType').isIn(DISCOUNT_TYPES).withMessage('Invalid discount type.')),
    maybe(body('discountValue').isInt({ min: 0 }).withMessage('Discount value must be a non-negative integer (percent, or paise for a flat discount).')),
    percentRange('discountValue', 'Discount'),
    body('maxDiscountAmount').optional({ nullable: true }).isInt({ min: 0 }).withMessage('Max discount must be a non-negative integer (paise, 0 = uncapped).'),

    maybe(body('commissionType').isIn(COMMISSION_TYPES).withMessage('Invalid commission type.')),
    maybe(body('commissionValue').isInt({ min: 0 }).withMessage('Commission value must be a non-negative integer (percent, or paise for a flat commission).')),
    percentRange('commissionValue', 'Commission'),

    body('usageLimit').optional({ nullable: true }).isInt({ min: 0 }).withMessage('Usage limit must be a non-negative integer (0 = unlimited).'),
    body('expiresAt').optional({ nullable: true }).isISO8601().withMessage('Expiry must be a valid date.').toDate(),
    body('isActive').optional({ nullable: true }).isBoolean().withMessage('isActive must be a boolean.'),
  ];
};

module.exports = {
  idParam,
  listQuery,
  createPromoCode: promoFields(false),
  updatePromoCode: promoFields(true),
};
