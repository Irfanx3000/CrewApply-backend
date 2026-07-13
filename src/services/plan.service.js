'use strict';

const Plan = require('../models/plan.model');
const auditService = require('./audit.service');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');
const { AUDIT_EVENTS } = require('../constants/audit');

const ctxOf = (req) => ({
  ipAddress: req?.ip || null,
  userAgent: req?.get?.('user-agent') || null,
});

// Admin-only management of the plan catalogue (prices/features). Amounts are in
// paise. Until the admin panel exists this is driven via Postman with an admin token.

const listAll = () => Plan.find().sort({ displayOrder: 1, tier: 1, billingCycle: 1 }).lean();

const create = async (body, adminId, req) => {
  // (tier, billingCycle) is unique — surface a clean 409 on duplicates.
  const exists = await Plan.findOne({ tier: body.tier, billingCycle: body.billingCycle });
  if (exists) {
    throw new AppError('A plan for this tier and billing cycle already exists.', HTTP_STATUS.CONFLICT, 'PLAN_EXISTS');
  }
  const plan = await Plan.create(body);
  auditService.log({ event: AUDIT_EVENTS.PLAN_CREATED, userId: adminId, ...ctxOf(req), metadata: { planId: plan._id, tier: plan.tier } }).catch(() => {});
  return plan;
};

const update = async (id, body, adminId, req) => {
  const plan = await Plan.findByIdAndUpdate(id, { $set: body }, { new: true, runValidators: true });
  if (!plan) {
    throw new AppError(AUTH_MESSAGES.PLAN_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'PLAN_NOT_FOUND');
  }
  auditService.log({ event: AUDIT_EVENTS.PLAN_UPDATED, userId: adminId, ...ctxOf(req), metadata: { planId: plan._id, changes: body } }).catch(() => {});
  return plan;
};

// Soft-deactivate (never hard-delete a plan that historical payments reference).
const deactivate = async (id, adminId, req) => {
  const plan = await Plan.findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true });
  if (!plan) {
    throw new AppError(AUTH_MESSAGES.PLAN_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'PLAN_NOT_FOUND');
  }
  auditService.log({ event: AUDIT_EVENTS.PLAN_UPDATED, userId: adminId, ...ctxOf(req), metadata: { planId: plan._id, deactivated: true } }).catch(() => {});
  return plan;
};

module.exports = { listAll, create, update, deactivate };
