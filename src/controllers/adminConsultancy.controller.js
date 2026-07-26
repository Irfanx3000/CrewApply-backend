'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { successResponse, paginationMeta } = require('../utils/apiResponse');
const consultancyService = require('../services/consultancy.service');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

const getConfig = asyncHandler(async (req, res) => {
  const data = await consultancyService.getConsultancyConfig();
  return successResponse(res, AUTH_MESSAGES.CONSULTANCY_CONFIG_FETCHED, data);
});

const setFee = asyncHandler(async (req, res) => {
  const data = await consultancyService.setConsultancyFee(req.body, req.user._id, req);
  return successResponse(res, AUTH_MESSAGES.CONSULTANCY_FEE_UPDATED, { fee: data });
});

// PATCH /admin/consultancy/schedule — full-replace the recurring weekly
// template ({ schedule: { sun:[{start,end}], ... }, slotIntervalMinutes }).
const updateSchedule = asyncHandler(async (req, res) => {
  const { schedule, slotIntervalMinutes } = req.body;
  const data = await consultancyService.updateWeeklySchedule({ schedule, slotIntervalMinutes }, req.user._id, req);
  return successResponse(res, AUTH_MESSAGES.CONSULTANCY_SCHEDULE_UPDATED, data);
});

const listBookings = asyncHandler(async (req, res) => {
  const { bookings, page, limit, total } = await consultancyService.listAdminBookings(req.query);
  return successResponse(res, AUTH_MESSAGES.CONSULTANCY_BOOKINGS_FETCHED, { bookings }, HTTP_STATUS.OK, paginationMeta(page, limit, total));
});

const getBookingById = asyncHandler(async (req, res) => {
  const booking = await consultancyService.getAdminBookingById(req.params.id);
  return successResponse(res, AUTH_MESSAGES.CONSULTANCY_BOOKING_FETCHED, { booking });
});

const updateBookingStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;
  const booking = await consultancyService.updateBookingStatus(req.params.id, { status, note }, req.user._id, req);
  return successResponse(res, AUTH_MESSAGES.CONSULTANCY_BOOKING_STATUS_UPDATED, { booking });
});

module.exports = {
  getConfig,
  setFee,
  updateSchedule,
  listBookings,
  getBookingById,
  updateBookingStatus,
};
