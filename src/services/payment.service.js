'use strict';

const Payment = require('../models/payment.model');
const razorpayService = require('./razorpay.service');
const auditService = require('./audit.service');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');
const { AUDIT_EVENTS } = require('../constants/audit');

// Type-agnostic core of the Razorpay payment flow — the one thing every kind
// of purchase (subscription, consultancy booking, …) shares: reconciling a
// stuck 'created' order against Razorpay directly, and handling the single
// webhook URL Razorpay calls regardless of what was purchased.
//
// Deliberately has NO top-level require of subscription.service.js or
// consultancy.service.js — each of THEM requires THIS file (for
// reconcilePendingOrder), so requiring them back at module-load time would
// be a circular require. getActivatorFor() resolves the right activate*
// function lazily, at call time, which sidesteps the cycle entirely.
const getActivatorFor = (type) => {
  if (type === 'consultancy') {
    // eslint-disable-next-line global-require
    return require('./consultancy.service').activateBooking;
  }
  // eslint-disable-next-line global-require
  return require('./subscription.service').activate;
};

const ctxOf = (req) => ({
  ipAddress: req?.ip || null,
  userAgent: req?.get?.('user-agent') || null,
});

const audit = (event, userId, req, metadata = {}) =>
  auditService.log({ event, userId, ...ctxOf(req), metadata }).catch(() => {});

/**
 * Given a locally-'created' order, ask Razorpay whether it was actually paid.
 *  • Not paid (user cancelled/abandoned)     → { paid:false } (caller may release it)
 *  • Paid (confirmation just never reached us) → activate it → { paid:true }
 * Byte-for-byte the same logic subscription.service.js used to own, now
 * type-dispatched via getActivatorFor so both subscriptions and consultancy
 * bookings share one implementation.
 */
const reconcilePendingOrder = async (payment, req) => {
  let order;
  try {
    order = await razorpayService.fetchOrder(payment.gatewayOrderId);
  } catch {
    // Can't reach the gateway — fail safe by treating it as NOT paid.
    return { paid: false };
  }

  const isPaid =
    order &&
    (order.status === 'paid' || Number(order.amount_paid || 0) >= payment.amount);
  if (!isPaid) return { paid: false };

  let capturedId = null;
  try {
    const list = await razorpayService.fetchOrderPayments(payment.gatewayOrderId);
    const items = (list && list.items) || [];
    capturedId = (items.find((p) => p.status === 'captured') || items[0] || {}).id || null;
  } catch {
    /* non-fatal — activation doesn't require the payment id */
  }

  const activate = getActivatorFor(payment.type);
  await activate(payment, { gatewayPaymentId: capturedId, signature: null }, req);
  return { paid: true };
};

/**
 * Razorpay server-to-server webhook — the ONE endpoint Razorpay calls no
 * matter what was purchased. Verifies the signature over the raw body,
 * applies the amount-match defense, then dispatches to the right activate*
 * by payment.type.
 */
const handleWebhook = async ({ rawBody, signature }, req) => {
  if (!razorpayService.verifyWebhookSignature(rawBody, signature)) {
    throw new AppError(AUTH_MESSAGES.WEBHOOK_INVALID_SIGNATURE, HTTP_STATUS.UNAUTHORIZED, 'INVALID_WEBHOOK_SIGNATURE');
  }

  let event;
  try {
    const text = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
    event = JSON.parse(text);
  } catch {
    throw new AppError('Invalid webhook payload.', HTTP_STATUS.BAD_REQUEST, 'INVALID_PAYLOAD');
  }

  audit(AUDIT_EVENTS.WEBHOOK_RECEIVED, null, req, { event: event.event });

  const paymentEntity = event?.payload?.payment?.entity;
  const orderEntity = event?.payload?.order?.entity;
  const orderId = paymentEntity?.order_id || orderEntity?.id;

  if (!orderId) return { received: true };

  const payment = await Payment.findOne({ gatewayOrderId: orderId });
  if (!payment) return { received: true }; // not one of ours — ignore

  if (event.event === 'payment.captured' || event.event === 'order.paid') {
    // Defense in depth: the amount actually paid must match what we recorded.
    const paidAmount = paymentEntity?.amount ?? orderEntity?.amount;
    if (paidAmount != null && Number(paidAmount) !== payment.amount) {
      audit(AUDIT_EVENTS.PAYMENT_FAILED, payment.user, req, { orderId, reason: 'amount_mismatch', paidAmount });
      return { received: true };
    }
    const activate = getActivatorFor(payment.type);
    await activate(payment, { gatewayPaymentId: paymentEntity?.id || null, signature: null }, req);
  } else if (event.event === 'payment.failed') {
    await Payment.updateOne({ _id: payment._id, status: 'created' }, { $set: { status: 'failed' } });
    audit(AUDIT_EVENTS.PAYMENT_FAILED, payment.user, req, { orderId });
  }

  return { received: true };
};

module.exports = { reconcilePendingOrder, handleWebhook };
