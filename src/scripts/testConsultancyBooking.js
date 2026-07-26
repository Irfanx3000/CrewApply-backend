'use strict';

/**
 * Proves the Consultancy Booking feature end-to-end against real Razorpay
 * TEST-mode keys (rzp_test_...) and the real DB, using the RECURRING WEEKLY
 * SCHEDULE model with TIME RANGES (lunch-break gaps) and a configurable
 * slot-dicing interval (not per-date admin-created slots, not discrete times):
 *  1) Admin sets a weekly schedule with TWO ranges on tomorrow's weekday
 *     (09:00–12:00 and 13:00–17:00 — a lunch-break gap) at a 30-min interval.
 *  2) User sees it via getAvailability()/getSlotsForDate() — derived live
 *     from the schedule, diced into individual start times by the interval —
 *     and the 12:00–13:00 gap is proven to NOT appear as bookable.
 *  3) User creates a booking order for one of those times — this LAZILY
 *     creates the ConsultancySlot occurrence row (status 'reserved') — a
 *     real Razorpay test-mode order is created.
 *  4) Payment is "completed" the same way testRenewal.js/testReferral.js
 *     simulate one: a locally-computed HMAC signature (the same formula
 *     razorpayService.verifyPaymentSignature checks), fed through the real
 *     verifyPayment() path — the occurrence flips reserved -> booked, a
 *     ConsultancyBooking is created with status 'awaiting_confirmation'.
 *  5) Admin lists/views the booking and confirms it with a note — user gets
 *     a Notification (and an email attempt via resend.service.js, a clean
 *     no-op if RESEND_API_KEY isn't set).
 *  6) A second booking attempt on the SAME date+time is rejected
 *     (SLOT_NOT_AVAILABLE) — proves the double-booking guard still holds
 *     under the lazy-creation model.
 *  7) Removing the morning range from the weekly schedule makes that time
 *     stop showing as available for a DIFFERENT, not-yet-booked occurrence.
 *  8) Switching slotIntervalMinutes 30 -> 15 doubles the number of bookable
 *     start times inside the remaining (unbooked) range — proves the
 *     interval is actually configurable, not hardcoded.
 *
 * Run: node src/scripts/testConsultancyBooking.js
 */

require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Payment = require('../models/payment.model');
const ConsultancySlot = require('../models/consultancySlot.model');
const ConsultancyBooking = require('../models/consultancyBooking.model');
const ConsultancyWeeklySchedule = require('../models/consultancyWeeklySchedule.model');
const Notification = require('../models/notification.model');
const { ROLES } = require('../constants/roles');
const { WEEKDAY_KEYS } = require('../constants/consultancy');
const consultancyService = require('../services/consultancy.service');

const fakeReq = { ip: '127.0.0.1', get: () => 'test-script' };

const freshUser = async (u) => User.findById(u._id);

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ DB connected\n');

  // ── Test user (fixed throwaway account, reset each run) ──
  const email = 'consultancy.test@example.com';
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      name: 'Consultancy Test', email, password: 'Passw0rd!23',
      phone: '+919000000099', phoneVerified: true, isActive: true, country: 'India',
    });
  } else if (user.country !== 'India') {
    user.country = 'India';
    await user.save();
  }

  // ── Reuse any real admin so the audit trail/notifyAdmins path is real ──
  const admin = await User.findOne({ role: ROLES.ADMIN, isActive: true });
  if (!admin) {
    console.error('❌ No active admin user found in this DB — cannot test admin-side flows. Aborting.');
    await mongoose.disconnect();
    process.exit(1);
  }

  // ── Reset this test user's consultancy data + the schedule singleton ──
  const oldBookings = await ConsultancyBooking.find({ user: user._id }).select('_id slot payment');
  await ConsultancyBooking.deleteMany({ user: user._id });
  await Payment.deleteMany({ user: user._id });
  await ConsultancySlot.deleteMany({ _id: { $in: oldBookings.map((b) => b.slot) } });
  await Notification.deleteMany({ user: user._id });
  await ConsultancyWeeklySchedule.deleteMany({});
  user = await freshUser(user);
  console.log('✓ reset test user + schedule\n');

  // ── Set a small, real consultancy fee ──
  await consultancyService.setConsultancyFee({ india: { amount: 9900 }, global: { amount: 500 } }, admin._id, fakeReq);
  console.log('✓ consultancy fee set (₹99 / $5)\n');

  // ── 1) Admin sets the weekly schedule: two ranges on tomorrow's weekday,
  //        with a lunch-break gap between 12:00 and 13:00, at 30-min interval ──
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const dateStr = tomorrow.toISOString().slice(0, 10);
  const weekday = WEEKDAY_KEYS[new Date(`${dateStr}T00:00:00.000Z`).getUTCDay()];
  const morningRange = { start: '09:00', end: '12:00' };
  const afternoonRange = { start: '13:00', end: '17:00' };
  const startTime = '09:00';

  const emptySchedule = Object.fromEntries(WEEKDAY_KEYS.map((d) => [d, []]));
  const { schedule } = await consultancyService.updateWeeklySchedule(
    { schedule: { ...emptySchedule, [weekday]: [morningRange, afternoonRange] }, slotIntervalMinutes: 30 },
    admin._id,
    fakeReq
  );
  console.log('1) admin set weekly schedule →', weekday, '=', JSON.stringify(schedule[weekday]), '\n');

  // ── 2) User sees it via availability + slots-for-date, lunch gap excluded ──
  const month = dateStr.slice(0, 7);
  const availability = await consultancyService.getAvailability({ month });
  const dateIsAvailable = availability.some((d) => d.date === dateStr && d.hasOpenSlots);
  console.log('2a) getAvailability shows', dateStr, '→', dateIsAvailable ? '✅' : '❌ MISSING');

  const slotsForDate = await consultancyService.getSlotsForDate(dateStr);
  const times = slotsForDate.map((s) => s.startTime).sort();
  const slotVisible = times.includes(startTime);
  const gapExcluded = !times.includes('12:00') && !times.includes('12:30');
  const expectedCount = 6 /* 09:00..11:30 */ + 8 /* 13:00..16:30 */;
  console.log('2b) getSlotsForDate shows', startTime, '→', slotVisible ? '✅' : '❌ MISSING');
  console.log('2c) lunch-break gap (12:00–13:00) excluded →', gapExcluded ? '✅' : '❌ LEAKED', times.join(','));
  console.log('2d) slot count at 30-min interval →', times.length, times.length === expectedCount ? '✅' : `❌ expected ${expectedCount}`, '\n');

  // ── 3) User creates a booking order (lazily creates the occurrence row) ──
  const order = await consultancyService.createBookingOrder(
    { user, date: dateStr, startTime, topic: 'resume_review', requirement: 'Please review my CV before I apply.', resumeDocumentId: null },
    fakeReq
  );
  console.log('3) order created →', order.orderId, `₹${order.amount / 100}`);

  const reservedSlot = await ConsultancySlot.findById(order.slotId).lean();
  console.log('   occurrence row status after order →', reservedSlot?.status, reservedSlot?.status === 'reserved' ? '✅' : '❌', '\n');

  // ── 4) Simulate a real Razorpay payment signature and verify ──
  const fakePaymentId = `pay_test_${crypto.randomBytes(6).toString('hex')}`;
  const signature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${order.orderId}|${fakePaymentId}`)
    .digest('hex');

  const verifyResult = await consultancyService.verifyPayment(
    { user, orderId: order.orderId, paymentId: fakePaymentId, signature },
    fakeReq
  );
  console.log('4) payment verified → booking status:', verifyResult.status, verifyResult.status === 'awaiting_confirmation' ? '✅' : '❌');

  const bookedSlot = await ConsultancySlot.findById(order.slotId).lean();
  console.log('   occurrence row status after verify →', bookedSlot?.status, bookedSlot?.status === 'booked' ? '✅' : '❌', '\n');

  // ── 5) Admin lists, views, and confirms the booking ──
  const adminList = await consultancyService.listAdminBookings({});
  const foundInList = adminList.bookings.some((b) => String(b.id) === String(verifyResult.id));
  console.log('5a) admin listAdminBookings shows it →', foundInList ? '✅' : '❌');

  const adminDetail = await consultancyService.getAdminBookingById(verifyResult.id);
  console.log('5b) admin getAdminBookingById → topic:', adminDetail.topic, 'user:', adminDetail.user?.name);

  const confirmed = await consultancyService.updateBookingStatus(
    verifyResult.id,
    { status: 'confirmed', note: 'Meet link: https://meet.google.com/test-link — see you then!' },
    admin._id,
    fakeReq
  );
  console.log('5c) admin confirmed booking → status:', confirmed.status, confirmed.status === 'confirmed' ? '✅' : '❌');

  const notification = await Notification.findOne({ user: user._id, type: 'CONSULTANCY_BOOKING_CONFIRMED' }).sort({ createdAt: -1 });
  console.log('   user notification created →', notification ? '✅' : '❌ MISSING', '\n');

  // Double-decision guard: confirming again should be rejected.
  let secondStatusChangeBlocked = null;
  try {
    await consultancyService.updateBookingStatus(verifyResult.id, { status: 'rejected', note: 'oops' }, admin._id, fakeReq);
  } catch (e) {
    secondStatusChangeBlocked = e.errorCode || e.code || e.message;
  }
  console.log('5d) re-deciding an already-decided booking blocked →', secondStatusChangeBlocked ? '✅' : '❌ ALLOWED (bug)', '\n');

  // ── 6) Double-booking guard: booking the same date+time again ──
  let secondBookingBlocked = null;
  try {
    await consultancyService.createBookingOrder(
      { user, date: dateStr, startTime, topic: 'career_guidance', requirement: '', resumeDocumentId: null },
      fakeReq
    );
  } catch (e) {
    secondBookingBlocked = e.errorCode || e.code || e.message;
  }
  console.log('6) second booking on same date+time →', secondBookingBlocked === 'SLOT_NOT_AVAILABLE' ? '✅ BLOCKED (SLOT_NOT_AVAILABLE)' : `❌ ${secondBookingBlocked || 'allowed'}`);

  // ── 7) Removing the morning range from the schedule removes it from availability ──
  await consultancyService.updateWeeklySchedule(
    { schedule: { ...emptySchedule, [weekday]: [afternoonRange] }, slotIntervalMinutes: 30 },
    admin._id,
    fakeReq
  );
  const slotsAfterRemoval = await consultancyService.getSlotsForDate(dateStr);
  const morningStillOffered = slotsAfterRemoval.some((s) => s.startTime === '09:30'); // unbooked morning time
  console.log('7) removing the morning range removes its (unbooked) times →', !morningStillOffered ? '✅' : '❌ STILL OFFERED', '\n');

  // ── 8) Switching the interval 30 -> 15 doubles bookable times in the remaining range ──
  await consultancyService.updateWeeklySchedule(
    { schedule: { ...emptySchedule, [weekday]: [afternoonRange] }, slotIntervalMinutes: 15 },
    admin._id,
    fakeReq
  );
  const slotsAt15 = await consultancyService.getSlotsForDate(dateStr);
  const expectedAt15 = 16; // 13:00..16:45 in 15-min steps across a 4-hour range
  console.log('8) switching to 15-min interval →', slotsAt15.length, 'slots', slotsAt15.length === expectedAt15 ? '✅' : `❌ expected ${expectedAt15}`, '\n');

  const pass =
    dateIsAvailable && slotVisible && gapExcluded && times.length === expectedCount &&
    reservedSlot?.status === 'reserved' &&
    verifyResult.status === 'awaiting_confirmation' &&
    bookedSlot?.status === 'booked' &&
    foundInList &&
    confirmed.status === 'confirmed' &&
    !!notification &&
    !!secondStatusChangeBlocked &&
    secondBookingBlocked === 'SLOT_NOT_AVAILABLE' &&
    !morningStillOffered &&
    slotsAt15.length === expectedAt15;

  console.log('\n' + (pass
    ? '✅ PASS — range-based recurring-schedule consultancy booking flow works end-to-end (ranges + lunch gap + configurable interval → order → pay → admin confirm → guards hold)'
    : '❌ FAIL — see ❌ markers above'));

  await mongoose.disconnect();
  process.exit(pass ? 0 : 1);
})().catch(async (e) => {
  console.error('ERROR:', e);
  await mongoose.disconnect();
  process.exit(1);
});
