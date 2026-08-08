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

    // Set only when this order is a plan SWITCH (upgrade/downgrade, or a
    // billing-cycle change on the same tier) — the Subscription being
    // replaced. Used by activate() to decide fresh-start-from-today vs
    // stack-on-remaining-time, and to know which subscription to credit
    // proration against. Null for a first-time purchase or a same-plan renewal.
    previousSubscription: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', default: null },
    // Paise credited from the old plan's unused CASH-paid value (never from
    // amountBeforeCredit/walletApplied — see subscription.service.js's
    // computeProratedCredit for why: crediting the wallet-funded portion
    // back out would let a user launder wallet credit into more wallet
    // credit by switching repeatedly).
    proratedCredit: { type: Number, default: 0 },
    // Paise of proratedCredit beyond what this charge could absorb (e.g. a
    // downgrade to a much cheaper plan) — credited to the wallet once this
    // payment activates, never refunded as cash (no partial-refund gateway
    // integration exists in this codebase).
    excessProrationCredit: { type: Number, default: 0 },
    // Why proratedCredit came out the way it did — frozen alongside the amount
    // so the summary can explain a zero credit ("you've used all your
    // applications") instead of silently showing nothing, and so support can
    // answer "why did I get so little back" from the record itself.
    prorationReason: {
      type: String,
      enum: {
        values: ['not_applicable', 'quota_exhausted', 'no_time_remaining', 'no_cash_paid', 'partial'],
        message: 'Invalid proration reason.',
      },
      default: 'not_applicable',
    },
    // Classified once at order-creation time and stored (rather than
    // re-derived later) so a reused/abandoned order's summary always shows
    // the same scenario it was created under, even if the user's live
    // subscription state has since changed.
    scenario: {
      type: String,
      enum: { values: ['purchase', 'renewal', 'upgrade', 'downgrade'], message: 'Invalid scenario.' },
      default: 'purchase',
    },

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
