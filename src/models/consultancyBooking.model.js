'use strict';

const mongoose = require('mongoose');
const { CONSULTANCY_TOPICS } = require('../constants/consultancy');

// Created only once payment is confirmed (see consultancy.service.js#activateBooking) —
// mirrors Subscription, which is likewise created only inside its own activate(),
// never at order-creation time.
const BOOKING_STATUSES = Object.freeze(['awaiting_confirmation', 'confirmed', 'rejected']);

const consultancyBookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Unique — a slot can back at most one booking (the DB-level backstop
    // behind ConsultancySlot's own atomic reserve/book CAS).
    slot: { type: mongoose.Schema.Types.ObjectId, ref: 'ConsultancySlot', required: true, unique: true },

    topic: {
      type: String,
      enum: { values: CONSULTANCY_TOPICS, message: 'Invalid consultancy topic.' },
      required: true,
    },

    requirement: { type: String, trim: true, maxlength: 500, default: '' },

    // Snapshot of which resume was attached at booking time — not re-resolved
    // later, so a user replacing their resume afterward doesn't retroactively
    // change what an already-booked session is based on.
    resumeDocument: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },

    // 1:1 with Payment.
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true, unique: true },

    status: {
      type: String,
      enum: { values: BOOKING_STATUSES, message: 'Invalid booking status.' },
      default: 'awaiting_confirmation',
      index: true,
    },

    // Free text an admin pastes (the actual meeting link/details) — becomes
    // the body of the confirmation/rejection email sent via resend.service.js.
    adminNote: { type: String, trim: true, default: null },
    statusUpdatedAt: { type: Date, default: null },
    statusUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

consultancyBookingSchema.index({ user: 1, createdAt: -1 });
consultancyBookingSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('ConsultancyBooking', consultancyBookingSchema);
module.exports.BOOKING_STATUSES = BOOKING_STATUSES;
