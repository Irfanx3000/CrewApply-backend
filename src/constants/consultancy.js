'use strict';

// Fixed topic enum — matches CrewApply/src/i18n/locales/en/translation.json's
// `consultancy.topics.*` keys exactly. Not admin-configurable in v1 (unlike
// JobTaxonomy/DocumentType) — the user explicitly didn't ask for topic
// management, only for booking/availability/admin-visibility to work.
const CONSULTANCY_TOPICS = Object.freeze([
  'career_guidance',
  'resume_review',
  'interview_prep',
  'visa_support',
  'sea_time',
]);

// Index-matches Date#getUTCDay() (0=Sunday..6=Saturday) — the canonical
// weekday-key ordering shared by ConsultancyWeeklySchedule.schedule and the
// mobile app's own consultancy.weekdays.* i18n keys.
const WEEKDAY_KEYS = Object.freeze(['sun', 'mon', 'tue', 'wed', 'thurs', 'fri', 'sat']);

// How finely an admin-defined time RANGE (e.g. 09:00–17:00) is diced into
// individual bookable slots — one global setting, admin-configurable
// between these two values (see ConsultancyWeeklySchedule.slotIntervalMinutes).
const ALLOWED_SLOT_INTERVALS = Object.freeze([15, 30]);
const DEFAULT_SLOT_INTERVAL_MINUTES = 30;

// Same value as subscription.service.js's PENDING_TTL_MS — kept in sync
// deliberately, both represent "how long an abandoned Razorpay checkout is
// tolerated before its held resource is released."
const SLOT_HOLD_TTL_MS = 15 * 60 * 1000;

const timeToMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};

const minutesToTime = (mins) => {
  const wrapped = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// "HH:mm" + minutes -> "HH:mm", used to derive a slot's endTime server-side.
const addMinutes = (hhmm, minutes) => minutesToTime(timeToMinutes(hhmm) + minutes);

// A valid range boundary: "HH:mm", 24h, minutes on a 15-minute grid — the
// coarsest grid either allowed interval (15 or 30) divides evenly into, so
// ranges drawn on this grid always dice cleanly regardless of which
// interval is currently configured.
const isValidTimeString = (value) => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value))) return false;
  return timeToMinutes(value) % 15 === 0;
};

// A single { start, end } range is well-formed: both on the 15-min grid,
// end strictly after start, within one calendar day.
const isValidRange = (range) =>
  !!range &&
  isValidTimeString(range.start) &&
  isValidTimeString(range.end) &&
  timeToMinutes(range.end) > timeToMinutes(range.start);

// Dices one { start, end } range into the "HH:mm" start times of every
// bookable slot inside it, at the given interval — e.g. ("09:00","10:00",30)
// -> ["09:00","09:30"] (09:30's slot ends exactly at 10:00; nothing starts
// AT 10:00 since that's the range's own end boundary, not a bookable start).
const expandRangeToStartTimes = (range, intervalMinutes) => {
  const startMin = timeToMinutes(range.start);
  const endMin = timeToMinutes(range.end);
  const times = [];
  for (let m = startMin; m + intervalMinutes <= endMin; m += intervalMinutes) {
    times.push(minutesToTime(m));
  }
  return times;
};

module.exports = {
  CONSULTANCY_TOPICS,
  WEEKDAY_KEYS,
  ALLOWED_SLOT_INTERVALS,
  DEFAULT_SLOT_INTERVAL_MINUTES,
  SLOT_HOLD_TTL_MS,
  timeToMinutes,
  minutesToTime,
  addMinutes,
  isValidTimeString,
  isValidRange,
  expandRangeToStartTimes,
};
