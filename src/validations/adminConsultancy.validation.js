'use strict';

const { body, query, param } = require('express-validator');
const { WEEKDAY_KEYS, ALLOWED_SLOT_INTERVALS, isValidTimeString } = require('../constants/consultancy');

const setFeeBody = [
  body('india.amount').optional().isInt({ min: 0 }).withMessage('india.amount must be a non-negative integer (paise).'),
  body('global.amount').optional().isInt({ min: 0 }).withMessage('global.amount must be a non-negative integer (cents).'),
];

// PATCH /admin/consultancy/schedule —
// { schedule: { sun:[{start,end}], mon:[...], ... }, slotIntervalMinutes }.
// Each day key is optional (defaults to [] downstream); when present, must
// be an array of { start, end } ranges on the 15-minute grid. The service
// re-validates start<end and drops anything malformed, so this layer only
// needs to catch the obviously wrong shape.
const timeField = (path) =>
  body(path).optional().custom((value) => isValidTimeString(value)).withMessage(`${path} must be "HH:mm" on a 15-minute grid.`);

const updateScheduleBody = [
  body('schedule').isObject().withMessage('schedule is required.'),
  body('slotIntervalMinutes').optional().isIn(ALLOWED_SLOT_INTERVALS).withMessage('slotIntervalMinutes must be 15 or 30.'),
  ...WEEKDAY_KEYS.flatMap((day) => [
    body(`schedule.${day}`).optional().isArray().withMessage(`schedule.${day} must be an array.`),
    timeField(`schedule.${day}.*.start`),
    timeField(`schedule.${day}.*.end`),
  ]),
];

const listBookingsQuery = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('status').optional().isString(),
  query('topic').optional().isString(),
  query('search').optional().isString().trim().isLength({ max: 200 }),
];

const bookingIdParam = [param('id').isMongoId().withMessage('Invalid booking id.')];

const updateBookingStatus = [
  body('status').isIn(['confirmed', 'rejected']).withMessage('status must be confirmed or rejected.'),
  body('note').optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 2000 }).withMessage('note must not exceed 2000 characters.'),
];

module.exports = {
  setFeeBody,
  updateScheduleBody,
  listBookingsQuery,
  bookingIdParam,
  updateBookingStatus,
};
