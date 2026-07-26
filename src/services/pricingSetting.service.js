'use strict';

const PricingSetting = require('../models/pricingSetting.model');
const auditService = require('./audit.service');
const { AUDIT_EVENTS } = require('../constants/audit');

const ctxOf = (req) => ({
  ipAddress: req?.ip || null,
  userAgent: req?.get?.('user-agent') || null,
});

// Singleton settings doc — upserted so callers never have to worry about it
// not existing yet (first read/write creates it).
const getOrCreate = async () => {
  const setting = await PricingSetting.findOneAndUpdate(
    {},
    { $setOnInsert: {} },
    { new: true, upsert: true }
  );
  return setting;
};

const getOverride = async () => {
  const setting = await getOrCreate();
  return setting.yearlyDiscountOverridePercent;
};

// `percent: null` clears the override, reverting the mobile app's yearly-offer
// badge back to the auto-computed value.
const setOverride = async (percent, adminId, req) => {
  const setting = await getOrCreate();
  setting.yearlyDiscountOverridePercent = percent;
  await setting.save();
  auditService
    .log({ event: AUDIT_EVENTS.PRICING_SETTING_UPDATED, userId: adminId, ...ctxOf(req), metadata: { yearlyDiscountOverridePercent: percent } })
    .catch(() => {});
  return setting.yearlyDiscountOverridePercent;
};

// Region-priced flat fee for booking a Consultancy session — mirrors
// getOverride/setOverride's singleton-doc shape exactly.
const getConsultancyFee = async () => {
  const setting = await getOrCreate();
  return setting.consultancyFee;
};

const setConsultancyFee = async ({ india, global }, adminId, req) => {
  const setting = await getOrCreate();
  if (india?.amount != null) setting.consultancyFee.india.amount = india.amount;
  if (global?.amount != null) setting.consultancyFee.global.amount = global.amount;
  await setting.save();
  auditService
    .log({ event: AUDIT_EVENTS.CONSULTANCY_FEE_UPDATED, userId: adminId, ...ctxOf(req), metadata: { consultancyFee: setting.consultancyFee } })
    .catch(() => {});
  return setting.consultancyFee;
};

module.exports = { getOverride, setOverride, getConsultancyFee, setConsultancyFee };
