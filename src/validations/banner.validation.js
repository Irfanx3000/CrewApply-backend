'use strict';

const { body, param } = require('express-validator');

const imageUrlField = (optional) => {
  const chain = body('imageUrl');
  return (optional ? chain.optional({ nullable: true, checkFalsy: true }) : chain.notEmpty().withMessage('Banner image is required.'))
    .isString().withMessage('imageUrl must be a string.');
};

const linkUrlField = () =>
  body('linkUrl')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isURL().withMessage('linkUrl must be a valid URL.');

const activeField = () =>
  body('active').optional().isBoolean().withMessage('active must be true or false.').toBoolean();

const orderField = () =>
  body('order').optional().isInt().withMessage('order must be a number.').toInt();

// ── POST /admin/banners ────────────────────────────────────────────────────────

const createBanner = [
  imageUrlField(false),
  linkUrlField(),
  activeField(),
  orderField(),
];

// ── PATCH /admin/banners/:id ───────────────────────────────────────────────────

const updateBanner = [
  imageUrlField(true),
  linkUrlField(),
  activeField(),
  orderField(),
];

// ── :id param ──────────────────────────────────────────────────────────────────

const bannerIdParam = [
  param('id').isMongoId().withMessage('Invalid banner ID.'),
];

module.exports = { createBanner, updateBanner, bannerIdParam };
