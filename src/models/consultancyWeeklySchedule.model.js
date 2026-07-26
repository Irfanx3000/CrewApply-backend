'use strict';

const mongoose = require('mongoose');

// Singleton document (exactly one row, upserted — same idiom as
// PricingSetting) holding the admin's RECURRING weekly availability,
// indefinitely, until an admin changes it — no per-date upkeep.
//
// Keys match CrewApply's existing weekday i18n keys (consultancy.weekdays.*
// in the mobile app) so day-of-week naming stays consistent across the
// whole feature. Each day's value is an array of TIME RANGES —
// { start: "HH:mm", end: "HH:mm" } — not a flat list of discrete times, so
// an admin can express a lunch break as two ranges (e.g. 09:00–12:00 and
// 13:00–17:00) instead of unchecking every slot in between. Ranges are
// diced into actual bookable start times by slotIntervalMinutes at read
// time (see consultancy.service.js's expandRangeToStartTimes) — kept as
// Mixed since the shape is validated at the request/service layer, same
// reasoning as before.
const consultancyWeeklyScheduleSchema = new mongoose.Schema(
  {
    schedule: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({ sun: [], mon: [], tue: [], wed: [], thurs: [], fri: [], sat: [] }),
    },

    // How finely a range is diced into individual bookable slots — one
    // global setting (not per-day/per-range) an admin can toggle between
    // 15 and 30 minutes.
    slotIntervalMinutes: {
      type: Number,
      enum: { values: [15, 30], message: 'slotIntervalMinutes must be 15 or 30.' },
      default: 30,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model('ConsultancyWeeklySchedule', consultancyWeeklyScheduleSchema);
