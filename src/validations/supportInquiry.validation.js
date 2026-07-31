'use strict';

const { body, param, query } = require('express-validator');
const { STATUSES } = require('../models/supportInquiry.model');

// Denylist of attack-signature patterns, not a broad character block — a
// support message is free-form English and legitimately contains normal
// punctuation (semicolons, pipes in "and/or", parentheses, etc.), so this
// only rejects things that look like actual HTML/script markup or shell/SQL
// command syntax, not everyday text.
const DANGEROUS_PATTERNS = [
  /<\s*[a-z][^>]*>/i, // any HTML tag, e.g. <script>, <img>, <iframe>
  /javascript\s*:/i,
  /on\w+\s*=\s*["']/i, // inline event handlers: onerror=, onload=, onclick=...
  /`[^`]*`/, // backtick command substitution
  /\$\([^)]*\)/, // $(...) command substitution
  /\b(rm\s+-rf|sudo\s|chmod\s+[0-7]{3,4}|wget\s+http|curl\s+http|nc\s+-e)\b/i,
  /\b(drop\s+table|delete\s+from|insert\s+into|union\s+select|select\s+\*\s+from)\b/i,
];

const NO_DANGEROUS_CONTENT_MESSAGE = 'This field cannot contain script tags, HTML markup, or command-like text.';

const noDangerousContent = (value) => {
  if (value && DANGEROUS_PATTERNS.some((pattern) => pattern.test(value))) {
    throw new Error(NO_DANGEROUS_CONTENT_MESSAGE);
  }
  return true;
};

// ── POST /support ──────────────────────────────────────────────────────────────

const createInquiry = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required.')
    .isLength({ max: 100 }).withMessage('Name must not exceed 100 characters.')
    .custom(noDangerousContent),
  body('email').trim().notEmpty().withMessage('Email is required.').isEmail().withMessage('Please provide a valid email address.'),
  body('message')
    .trim()
    .notEmpty().withMessage('Please describe the issue you\'re facing.')
    .isLength({ max: 500 }).withMessage('Message must not exceed 500 characters.')
    .custom(noDangerousContent),
];

// ── :id param ──────────────────────────────────────────────────────────────────

const inquiryIdParam = [
  param('id').isMongoId().withMessage('Invalid support inquiry ID.'),
];

// ── GET /admin/support ────────────────────────────────────────────────────────

const listInquiriesQuery = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer.').toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('limit must be between 1 and 50.').toInt(),
  query('status').optional().isString(),
  query('search').optional().isString(),
];

// ── PATCH /admin/support/:id/status ───────────────────────────────────────────

const updateInquiryStatus = [
  body('status').isIn(STATUSES).withMessage(`status must be one of: ${STATUSES.join(', ')}.`),
  body('reply')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 1000 }).withMessage('Reply must not exceed 1000 characters.')
    .custom(noDangerousContent),
];

module.exports = { createInquiry, inquiryIdParam, listInquiriesQuery, updateInquiryStatus };
