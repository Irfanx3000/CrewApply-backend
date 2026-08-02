'use strict';

const mongoose = require('mongoose');

// A row here represents one REAL occurrence of a slot on one calendar date —
// created lazily, only the moment someone actually books it. General
// availability ("is 2pm open on Tuesdays") lives in
// ConsultancyWeeklySchedule instead; this model only ever needs to track
// occurrences that are actually occupied (a payment in flight, or a
// confirmed booking) or were once occupied but no longer are.
//
// 'released' (added alongside 'reserved'/'booked'): set when an admin
// rejects the booking that held this slot (see
// consultancy.service.js#updateBookingStatus). Deliberately NOT deleted —
// deleting would leave the rejected booking's `.populate('slot')` resolving
// to null, and presentBooking/presentAdminBooking's ternary would then
// crash trying to read `._id` off it. A 'released' row is excluded from
// every "taken" query (getAvailability/getSlotsForDate/claimSlot's CAS all
// already only special-case 'reserved'/'booked') while still being a real,
// populatable document for the old booking's historical date/time display.
const SLOT_STATUSES = Object.freeze(['reserved', 'booked', 'released']);

const consultancySlotSchema = new mongoose.Schema(
  {
    // UTC midnight for the calendar day this occurrence belongs to.
    date: { type: Date, required: true },

    startTime: { type: String, required: true, trim: true }, // "HH:mm", 24h
    endTime: { type: String, required: true, trim: true },   // "HH:mm", 24h — derived server-side

    status: {
      type: String,
      enum: { values: SLOT_STATUSES, message: 'Invalid slot status.' },
      required: true,
      index: true,
    },

    // Set at creation (the payment-in-flight hold) — see
    // consultancy.service.js's abandoned-hold sweep, which now DELETES the
    // row on expiry rather than resetting a status, since there's no
    // meaningful "available" state for a row to revert to.
    reservedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reservedAt: { type: Date, default: null },

    // Set once status flips to 'booked'.
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'ConsultancyBooking', default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// One occurrence row per date+time — the double-booking backstop (see
// consultancy.service.js#createBookingOrder's create-or-CAS-update dance).
consultancySlotSchema.index({ date: 1, startTime: 1 }, { unique: true });
// Abandoned-reservation sweep (reserved rows older than the hold TTL).
consultancySlotSchema.index({ status: 1, reservedAt: 1 });

module.exports = mongoose.model('ConsultancySlot', consultancySlotSchema);
module.exports.SLOT_STATUSES = SLOT_STATUSES;
