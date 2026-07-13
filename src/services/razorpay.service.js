'use strict';

const crypto = require('crypto');
const { config } = require('../config');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

let client = null;

/**
 * Lazily initialise the Razorpay SDK. Returns null when keys aren't configured
 * (the app still boots — payment endpoints surface a clear error instead).
 */
const getClient = () => {
  if (client) return client;
  const { keyId, keySecret } = config.razorpay;
  if (!keyId || !keySecret) return null;
  // eslint-disable-next-line global-require
  const Razorpay = require('razorpay');
  client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return client;
};

const assertConfigured = () => {
  const rzp = getClient();
  if (!rzp) {
    throw new AppError(
      AUTH_MESSAGES.PAYMENTS_NOT_CONFIGURED,
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      'PAYMENTS_NOT_CONFIGURED'
    );
  }
  return rzp;
};

/**
 * Create a Razorpay order for a one-time payment.
 * @param {{ amount:number, currency?:string, receipt:string, notes?:object }} opts
 *        amount is in the smallest currency unit (paise).
 * @returns {Promise<object>} the Razorpay order (order.id, amount, currency, …)
 */
const createOrder = async ({ amount, currency = 'INR', receipt, notes = {} }) => {
  const rzp = assertConfigured();
  return rzp.orders.create({
    amount, // paise
    currency,
    receipt,
    notes,
    payment_capture: 1, // auto-capture on successful authorization
  });
};

/**
 * Fetch an order's current state from Razorpay (status: created | attempted | paid,
 * and amount_paid). Used to reconcile a locally-'created' order — i.e. to find out
 * whether the user actually paid vs simply cancelled the checkout.
 */
const fetchOrder = async (orderId) => {
  const rzp = assertConfigured();
  return rzp.orders.fetch(orderId);
};

/**
 * Fetch the payments made against an order → { items: [{ id, status, ... }] }.
 */
const fetchOrderPayments = async (orderId) => {
  const rzp = assertConfigured();
  return rzp.orders.fetchPayments(orderId);
};

/**
 * Verify the client-side payment signature returned by Razorpay Checkout:
 *   HMAC_SHA256(order_id + '|' + payment_id, KEY_SECRET) === signature
 * @returns {boolean}
 */
const verifyPaymentSignature = ({ orderId, paymentId, signature }) => {
  const { keySecret } = config.razorpay;
  if (!keySecret || !orderId || !paymentId || !signature) return false;
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return timingSafeEqualHex(expected, signature);
};

/**
 * Verify a webhook's authenticity:
 *   HMAC_SHA256(rawBody, WEBHOOK_SECRET) === X-Razorpay-Signature
 * @param {Buffer|string} rawBody - the EXACT bytes received (not the parsed body)
 * @param {string} signature - value of the 'x-razorpay-signature' header
 * @returns {boolean}
 */
const verifyWebhookSignature = (rawBody, signature) => {
  const { webhookSecret } = config.razorpay;
  if (!webhookSecret || !rawBody || !signature) return false;
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');
  return timingSafeEqualHex(expected, signature);
};

// Constant-time hex comparison (avoids leaking timing info; safe on length mismatch).
const timingSafeEqualHex = (a, b) => {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

module.exports = {
  isConfigured: () => !!getClient(),
  createOrder,
  fetchOrder,
  fetchOrderPayments,
  verifyPaymentSignature,
  verifyWebhookSignature,
};
