'use strict';

const mongoose = require('mongoose');

// Lifecycle of a single payment/order.
const PAYMENT_STATUSES = Object.freeze(['created', 'paid', 'failed', 'refunded']);

const PAYMENT_TYPES = Object.freeze(['subscription', 'consultancy']);

const paymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Discriminates which downstream resource this order pays for — added
    // alongside the Consultancy Booking feature. Subscription remains the
    // default so every pre-existing Payment document (written before this
    // field existed) reads back as 'subscription' via the schema default.
    type: {
      type: String,
      enum: { values: PAYMENT_TYPES, message: 'Invalid payment type.' },
      default: 'subscription',
    },

    // Subscription-only fields below — conditionally required so a
    // type:'consultancy' payment doesn't need a plan/tier/billingCycle.
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      required: function () { return this.type === 'subscription'; },
    },
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      default: null,
    },
    tier: { type: String, required: function () { return this.type === 'subscription'; } },
    billingCycle: { type: String, required: function () { return this.type === 'subscription'; } },

    // Consultancy-only fields below — null for type:'subscription'.
    consultancySlot: { type: mongoose.Schema.Types.ObjectId, ref: 'ConsultancySlot', default: null },
    consultancyTopic: { type: String, default: null },
    consultancyRequirement: { type: String, default: null },
    consultancyResumeDocument: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
    consultancyBooking: { type: mongoose.Schema.Types.ObjectId, ref: 'ConsultancyBooking', default: null },

    // Snapshot of what was charged (server-computed) — never trusted from the client.
    // `amount` is the actual chargeable value AFTER any wallet credit was applied,
    // so existing webhook amount-match defense and revenue analytics stay correct
    // untouched; `amountBeforeCredit`/`walletApplied` record the discount itself.
    amount: { type: Number, required: true, min: 0 }, // paise
    amountBeforeCredit: { type: Number, default: 0 }, // paise, 0 when no wallet credit was applied
    walletApplied: { type: Number, default: 0 }, // paise debited from the buyer's wallet for this order
    currency: { type: String, default: 'INR' },

    status: {
      type: String,
      enum: { values: PAYMENT_STATUSES, message: 'Invalid payment status.' },
      default: 'created',
    },

    // Razorpay identifiers. gatewayOrderId is the idempotency key.
    gatewayOrderId: { type: String, required: true },
    gatewayPaymentId: { type: String, default: null },
    gatewaySignature: { type: String, default: null },
    receipt: { type: String, default: null },

    // Raw gateway/webhook payloads for auditing/debugging.
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Each Razorpay order maps to exactly one Payment row (idempotency).
paymentSchema.index({ gatewayOrderId: 1 }, { unique: true });
paymentSchema.index({ user: 1, status: 1 });

// ── The anti-double-charge lock ──────────────────────────────────────────────
// A user may have AT MOST ONE open ('created') order at a time. This partial
// unique index makes the database itself reject a second concurrent open order,
// so an impatient/retrying user can never end up with two payable orders.
paymentSchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { status: 'created' }, name: 'one_open_order_per_user' }
);

module.exports = mongoose.model('Payment', paymentSchema);
module.exports.PAYMENT_STATUSES = PAYMENT_STATUSES;
module.exports.PAYMENT_TYPES = PAYMENT_TYPES;
