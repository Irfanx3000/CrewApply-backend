'use strict';

const crypto = require('crypto');
const ConsultancySlot = require('../models/consultancySlot.model');
const ConsultancyBooking = require('../models/consultancyBooking.model');
const ConsultancyWeeklySchedule = require('../models/consultancyWeeklySchedule.model');
const Payment = require('../models/payment.model');
const Document = require('../models/document.model');
const User = require('../models/user.model');
const razorpayService = require('./razorpay.service');
const paymentService = require('./payment.service');
const pricingSettingService = require('./pricingSetting.service');
const notificationService = require('./notification.service');
const emailService = require('./email.service');
const auditService = require('./audit.service');
const AppError = require('../utils/AppError');
const { config } = require('../config');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');
const { AUDIT_EVENTS } = require('../constants/audit');
const { CURRENCY_BY_REGION, resolveRegion } = require('../utils/pricingRegion.util');
const { buildRegex } = require('../utils/searchUtil');
const {
  CONSULTANCY_TOPICS,
  WEEKDAY_KEYS,
  ALLOWED_SLOT_INTERVALS,
  DEFAULT_SLOT_INTERVAL_MINUTES,
  SLOT_HOLD_TTL_MS,
  addMinutes,
  isValidRange,
  expandRangeToStartTimes,
} = require('../constants/consultancy');

const ctxOf = (req) => ({
  ipAddress: req?.ip || null,
  userAgent: req?.get?.('user-agent') || null,
});

const audit = (event, userId, req, metadata = {}) =>
  auditService.log({ event, userId, ...ctxOf(req), metadata }).catch(() => {});

const parsePagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
};

const parseCsvFilter = (value) => {
  const tokens = String(value).split(',').map((v) => v.trim()).filter(Boolean);
  return tokens.length > 1 ? { $in: tokens } : tokens[0];
};

// "YYYY-MM-DD" -> UTC midnight Date, or null if malformed.
const parseDateOnly = (dateStr) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) return null;
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const toDateStr = (d) => d.toISOString().slice(0, 10);
const weekdayKeyFor = (date) => WEEKDAY_KEYS[date.getUTCDay()];

// ── Weekly recurring schedule (the admin-managed template) ────────────────────

// Returns { schedule: {sun:[{start,end}],...}, slotIntervalMinutes }.
const getWeeklySchedule = async () => {
  const doc = await ConsultancyWeeklySchedule.findOneAndUpdate(
    {},
    { $setOnInsert: {} },
    { new: true, upsert: true }
  );
  return { schedule: doc.schedule, slotIntervalMinutes: doc.slotIntervalMinutes };
};

const updateWeeklySchedule = async ({ schedule, slotIntervalMinutes }, adminId, req) => {
  // Full-replace semantics (matches PlanPricingModal's save-the-whole-form
  // convention) — validated shape-wise at the request layer; re-validated
  // here too since this is the actual write path. Malformed ranges are
  // dropped rather than rejected outright — the UI never produces one, so
  // this only guards against a stale/tampered request.
  const clean = {};
  for (const day of WEEKDAY_KEYS) {
    const ranges = Array.isArray(schedule?.[day]) ? schedule[day] : [];
    clean[day] = ranges.filter(isValidRange).map((r) => ({ start: r.start, end: r.end }));
  }
  const interval = ALLOWED_SLOT_INTERVALS.includes(slotIntervalMinutes) ? slotIntervalMinutes : DEFAULT_SLOT_INTERVAL_MINUTES;

  const doc = await ConsultancyWeeklySchedule.findOneAndUpdate(
    {},
    { $set: { schedule: clean, slotIntervalMinutes: interval } },
    { new: true, upsert: true }
  );

  audit(AUDIT_EVENTS.CONSULTANCY_SCHEDULE_UPDATED, adminId, req, { schedule: clean, slotIntervalMinutes: interval });
  return { schedule: doc.schedule, slotIntervalMinutes: doc.slotIntervalMinutes };
};

// ── Abandoned-hold / abandoned-order sweeps ───────────────────────────────────
// Same TTL, same idea as subscription.service.js's abandoned-order release.
// A reserved ConsultancySlot row only ever exists because a payment is (or
// was) in flight for it — once that hold expires, the row is simply DELETED
// rather than reset to some "available" status: with the recurring-schedule
// model, "no row exists" already means "available per the template", so
// there's nothing else to reset it to.

const releaseAbandonedHolds = async () => {
  await ConsultancySlot.deleteMany({
    status: 'reserved',
    reservedAt: { $lt: new Date(Date.now() - SLOT_HOLD_TTL_MS) },
  });
};

const releaseAbandonedOrders = async (userId) => {
  await Payment.updateMany(
    { user: userId, status: 'created', createdAt: { $lt: new Date(Date.now() - SLOT_HOLD_TTL_MS) } },
    { $set: { status: 'failed' } }
  );
};

// ── User-facing: availability ─────────────────────────────────────────────────

// month: "YYYY-MM". Returns which dates (today or later) have at least one
// still-unbooked time per the recurring weekly schedule — the mobile
// calendar only needs a boolean per date.
// A slot counts as "taken" for display purposes if it's booked, or if it's
// still a fresh (non-expired) reservation hold. Without the reservedAt age
// check, an abandoned checkout would make a slot look permanently
// unavailable to every OTHER user until someone else happened to trigger
// releaseAbandonedHolds()'s lazy sweep via their own createBookingOrder call
// — these read endpoints never called it themselves. This only affects what
// gets REPORTED as taken; the actual row is still physically deleted later
// by the existing sweep, unchanged.
const takenMatch = () => ({
  $or: [
    { status: 'booked' },
    { status: 'reserved', reservedAt: { $gte: new Date(Date.now() - SLOT_HOLD_TTL_MS) } },
  ],
});

const getAvailability = async ({ month }) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month));
  if (!match) {
    throw new AppError('Invalid month.', HTTP_STATUS.BAD_REQUEST, 'INVALID_MONTH');
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;

  const monthStart = new Date(Date.UTC(year, monthIndex, 1));
  const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 1));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const rangeStart = monthStart > today ? monthStart : today;

  if (rangeStart >= monthEnd) return [];

  const { schedule, slotIntervalMinutes } = await getWeeklySchedule();

  // Only dates whose weekday has ANY enabled range are worth checking
  // against actual bookings — most days in a typical week are skipped here
  // for free.
  const candidates = [];
  for (let d = new Date(rangeStart); d < monthEnd; d.setUTCDate(d.getUTCDate() + 1)) {
    const ranges = schedule[weekdayKeyFor(d)] || [];
    const enabledCount = ranges.reduce((sum, r) => sum + expandRangeToStartTimes(r, slotIntervalMinutes).length, 0);
    if (enabledCount > 0) candidates.push({ date: new Date(d), dateStr: toDateStr(d), enabledCount });
  }
  if (!candidates.length) return [];

  // One aggregate for the whole visible range instead of one query per date.
  const takenAgg = await ConsultancySlot.aggregate([
    { $match: { date: { $in: candidates.map((c) => c.date) }, ...takenMatch() } },
    { $group: { _id: '$date', count: { $sum: 1 } } },
  ]);
  const takenByDateStr = new Map(takenAgg.map((t) => [toDateStr(t._id), t.count]));

  return candidates
    .filter((c) => (takenByDateStr.get(c.dateStr) || 0) < c.enabledCount)
    .map((c) => ({ date: c.dateStr, hasOpenSlots: true }));
};

const getSlotsForDate = async (dateStr) => {
  const date = parseDateOnly(dateStr);
  if (!date) throw new AppError('Invalid date.', HTTP_STATUS.BAD_REQUEST, 'INVALID_DATE');

  const { schedule, slotIntervalMinutes } = await getWeeklySchedule();
  const ranges = schedule[weekdayKeyFor(date)] || [];
  const enabledTimes = new Set(ranges.flatMap((r) => expandRangeToStartTimes(r, slotIntervalMinutes)));
  if (!enabledTimes.size) return [];

  const taken = await ConsultancySlot.find({ date, ...takenMatch() }).select('startTime').lean();
  const takenTimes = new Set(taken.map((s) => s.startTime));

  return Array.from(enabledTimes)
    .filter((time) => !takenTimes.has(time))
    .sort()
    .map((time) => ({ startTime: time, endTime: addMinutes(time, slotIntervalMinutes) }));
};

// Read-only price preview — same fee-resolution logic createBookingOrder
// runs (resolveRegion + pricingSettingService.getConsultancyFee()), exposed
// with no slot claim / side effects so the mobile app can show the price
// BEFORE the user fills out the booking form, not only after tapping
// "Confirm Booking" (which is what actually reserves a slot today).
const getFee = async (user) => {
  const region = resolveRegion(user);
  const fee = await pricingSettingService.getConsultancyFee();
  return { amount: fee?.[region]?.amount || 0, currency: CURRENCY_BY_REGION[region] };
};

// ── User-facing: create + verify a booking order ──────────────────────────────

const orderResponse = (payment, slot) => ({
  orderId: payment.gatewayOrderId,
  amount: payment.amount,
  currency: payment.currency,
  keyId: config.razorpay.keyId, // public key only
  slotId: String(slot._id),
  date: slot.date,
  startTime: slot.startTime,
  endTime: slot.endTime,
});

// Atomically claims the ConsultancySlot row for (date, startTime) — creating
// it on first-ever claim (nothing existed for this occurrence yet) or
// reserving it if a previous hold on it was already released. The unique
// {date,startTime} index is what makes this safe under concurrency: two
// simultaneous claims can't both create the row, and MongoDB itself can
// still surface a duplicate-key error on a racing upsert, so the create
// path is wrapped and retried as a plain claim against the now-existing row.
// Returns null if the slot is genuinely taken (reserved or booked already).
const claimSlot = async (date, startTime, endTime, userId) => {
  try {
    return await ConsultancySlot.create({ date, startTime, endTime, status: 'reserved', reservedBy: userId, reservedAt: new Date() });
  } catch (err) {
    if (!err || err.code !== 11000) throw err;
    return ConsultancySlot.findOneAndUpdate(
      { date, startTime, status: { $nin: ['reserved', 'booked'] } },
      { $set: { status: 'reserved', reservedBy: userId, reservedAt: new Date() } },
      { new: true }
    );
  }
};

const createBookingOrder = async ({ user, date: dateStr, startTime, topic, requirement, resumeDocumentId }, req) => {
  if (!CONSULTANCY_TOPICS.includes(topic)) {
    throw new AppError('Invalid topic.', HTTP_STATUS.BAD_REQUEST, 'INVALID_TOPIC');
  }
  const date = parseDateOnly(dateStr);
  if (!date) {
    throw new AppError('Invalid date.', HTTP_STATUS.BAD_REQUEST, 'INVALID_DATE');
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (date < today) {
    throw new AppError(AUTH_MESSAGES.CONSULTANCY_SLOT_NOT_AVAILABLE, HTTP_STATUS.BAD_REQUEST, 'SLOT_NOT_AVAILABLE');
  }

  // Never trust the client's date/time pair blindly — confirm this weekday's
  // ranges, diced at the current interval, actually produce this exact
  // start time in the current recurring schedule.
  const { schedule, slotIntervalMinutes } = await getWeeklySchedule();
  const ranges = schedule[weekdayKeyFor(date)] || [];
  const enabledTimes = new Set(ranges.flatMap((r) => expandRangeToStartTimes(r, slotIntervalMinutes)));
  if (!enabledTimes.has(startTime)) {
    throw new AppError(AUTH_MESSAGES.CONSULTANCY_SLOT_NOT_AVAILABLE, HTTP_STATUS.CONFLICT, 'SLOT_NOT_AVAILABLE');
  }
  const endTime = addMinutes(startTime, slotIntervalMinutes);

  if (resumeDocumentId) {
    const resumeDoc = await Document.findOne({
      _id: resumeDocumentId,
      user: user._id,
      category: 'resume',
      status: 'active',
    }).select('_id').lean();
    if (!resumeDoc) {
      throw new AppError(AUTH_MESSAGES.CONSULTANCY_RESUME_NOT_FOUND, HTTP_STATUS.BAD_REQUEST, 'RESUME_NOT_FOUND');
    }
  }

  const region = resolveRegion(user);
  const currency = CURRENCY_BY_REGION[region];

  // 1) Release anything abandoned so no lock/hold is held forever.
  await releaseAbandonedHolds();
  await releaseAbandonedOrders(user._id);

  // 2) Handle any in-progress order — of ANY type, since the anti-double-
  //    charge lock (Payment's one_open_order_per_user index) is payment-wide,
  //    not per-feature (see payment.model.js).
  const openPayment = await Payment.findOne({ user: user._id, status: 'created' });
  if (openPayment) {
    const { paid } = await paymentService.reconcilePendingOrder(openPayment, req);
    if (paid) {
      throw new AppError(AUTH_MESSAGES.PAYMENT_ALREADY_MADE, HTTP_STATUS.CONFLICT, 'PAYMENT_ALREADY_MADE');
    }

    const openSlot = openPayment.type === 'consultancy' && openPayment.consultancySlot
      ? await ConsultancySlot.findById(openPayment.consultancySlot)
      : null;

    if (openSlot && toDateStr(openSlot.date) === dateStr && openSlot.startTime === startTime) {
      // Same date+time → hand back the same order (Razorpay refuses to pay it twice).
      return orderResponse(openPayment, openSlot);
    }
    // A different slot, or a different payment type entirely → release the
    // abandoned order and, if it held a slot, that slot too (the row only
    // ever existed for this hold, so it's deleted, not just unmarked).
    await Payment.updateOne({ _id: openPayment._id, status: 'created' }, { $set: { status: 'cancelled' } });
    if (openSlot) {
      await ConsultancySlot.deleteOne({ _id: openSlot._id, status: 'reserved', reservedBy: user._id });
    }
  }

  // 3) Atomically claim THIS date+time — the double-booking guard. A null
  //    result means someone else's request won the race.
  const reserved = await claimSlot(date, startTime, endTime, user._id);
  if (!reserved) {
    throw new AppError(AUTH_MESSAGES.CONSULTANCY_SLOT_NOT_AVAILABLE, HTTP_STATUS.CONFLICT, 'SLOT_NOT_AVAILABLE');
  }

  // 4) Server computes the fee — never trust the client. Region (and
  //    therefore currency) resolved server-side, same as subscriptions.
  const fee = await pricingSettingService.getConsultancyFee();
  const amount = fee?.[region]?.amount || 0;

  const receipt = `cnsl_${crypto.randomBytes(10).toString('hex')}`;
  let order;
  try {
    order = await razorpayService.createOrder({
      amount,
      currency,
      receipt,
      notes: { userId: String(user._id), slotId: String(reserved._id), topic },
    });
  } catch (err) {
    // Release the slot we just claimed — we never got as far as a Payment row.
    await ConsultancySlot.deleteOne({ _id: reserved._id, status: 'reserved', reservedBy: user._id });
    throw err;
  }

  let payment;
  try {
    payment = await Payment.create({
      user: user._id,
      type: 'consultancy',
      amount,
      currency,
      consultancySlot: reserved._id,
      consultancyTopic: topic,
      consultancyRequirement: requirement || '',
      consultancyResumeDocument: resumeDocumentId || null,
      status: 'created',
      gatewayOrderId: order.id,
      receipt,
      metadata: { order },
    });
  } catch (err) {
    if (err && err.code === 11000) {
      const existing = await Payment.findOne({ user: user._id, status: 'created' });
      const existingSlot = existing?.consultancySlot ? await ConsultancySlot.findById(existing.consultancySlot) : null;
      if (existing && existingSlot) {
        // Lost the race to a different in-flight request for this same user —
        // don't hold a slot for an order we won't use.
        await ConsultancySlot.deleteOne({ _id: reserved._id, status: 'reserved', reservedBy: user._id });
        return orderResponse(existing, existingSlot);
      }
    }
    throw err;
  }

  audit(AUDIT_EVENTS.PAYMENT_INITIATED, user._id, req, { orderId: order.id, amount, slotId: String(reserved._id) });
  return orderResponse(payment, reserved);
};

const verifyPayment = async ({ user, orderId, paymentId, signature }, req) => {
  const ok = razorpayService.verifyPaymentSignature({ orderId, paymentId, signature });
  if (!ok) {
    throw new AppError(AUTH_MESSAGES.PAYMENT_VERIFICATION_FAILED, HTTP_STATUS.BAD_REQUEST, 'INVALID_SIGNATURE');
  }

  const payment = await Payment.findOne({ gatewayOrderId: orderId, type: 'consultancy' });
  if (!payment) {
    throw new AppError(AUTH_MESSAGES.PAYMENT_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'PAYMENT_NOT_FOUND');
  }
  if (String(payment.user) !== String(user._id)) {
    throw new AppError(AUTH_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN, 'FORBIDDEN');
  }

  const booking = await activateBooking(payment, { gatewayPaymentId: paymentId, signature }, req);
  return getMyBookingById(user._id, booking._id);
};

// ── Idempotent activation (shared by /verify and the webhook, via payment.service.js) ──

const activateBooking = async (payment, { gatewayPaymentId = null, signature = null } = {}, req) => {
  // Atomic guard: only the FIRST caller transitions the order to 'paid' —
  // byte-for-byte the same CAS subscription.service.js#activate uses.
  const paid = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $in: ['created', 'cancelled', 'failed'] } },
    { $set: { status: 'paid', gatewayPaymentId, gatewaySignature: signature } },
    { new: true }
  );

  if (!paid) {
    // Already processed → return the existing booking (true idempotency).
    return ConsultancyBooking.findOne({ payment: payment._id });
  }

  // Best-effort flip reserved -> booked. If this fails (e.g. an admin force-
  // closed the slot mid-checkout) the booking is still honored — money
  // already moved, nothing here can un-charge the user.
  await ConsultancySlot.updateOne(
    { _id: paid.consultancySlot, status: 'reserved', reservedBy: paid.user },
    { $set: { status: 'booked' } }
  );

  const booking = await ConsultancyBooking.create({
    user: paid.user,
    slot: paid.consultancySlot,
    topic: paid.consultancyTopic,
    requirement: paid.consultancyRequirement || '',
    resumeDocument: paid.consultancyResumeDocument || null,
    payment: paid._id,
    status: 'awaiting_confirmation',
  });

  await ConsultancySlot.updateOne({ _id: paid.consultancySlot }, { $set: { booking: booking._id } });
  paid.consultancyBooking = booking._id;
  await paid.save();

  audit(AUDIT_EVENTS.PAYMENT_SUCCEEDED, paid.user, req, { orderId: paid.gatewayOrderId, amount: paid.amount });

  Promise.all([
    User.findById(paid.user).select('name email'),
    ConsultancySlot.findById(paid.consultancySlot).select('date startTime').lean(),
  ])
    .then(([purchaser, slot]) => {
      if (!purchaser) return;
      notificationService.notifyAdmins({
        type: notificationService.NOTIFICATION_TYPES.CONSULTANCY_BOOKING_CREATED,
        title: 'New Consultancy Booking',
        body: `${purchaser.name} booked a consultancy session (${paid.consultancyTopic}).`,
        data: { bookingId: booking._id },
      });

      // Fire-and-forget, same non-blocking contract as the notification
      // above — confirms receipt immediately; sendConsultancyBookingStatusEmail
      // sends a second email once an admin actually confirms/rejects it.
      if (purchaser.email && slot) {
        emailService
          .sendConsultancyBookingReceivedEmail({
            to: purchaser.email,
            name: purchaser.name,
            topic: paid.consultancyTopic,
            slotDate: slot.date,
            slotTime: slot.startTime,
          })
          .catch(() => {});
      }
    })
    .catch(() => {});

  return booking;
};

// ── User-facing: booking history ──────────────────────────────────────────────

const presentBooking = (b) => ({
  id: b._id,
  topic: b.topic,
  requirement: b.requirement,
  status: b.status,
  adminNote: b.adminNote,
  resumeDocumentId: b.resumeDocument || null,
  slot: b.slot && typeof b.slot === 'object'
    ? { id: b.slot._id, date: b.slot.date, startTime: b.slot.startTime, endTime: b.slot.endTime }
    : { id: b.slot },
  createdAt: b.createdAt,
  statusUpdatedAt: b.statusUpdatedAt,
});

const listMyBookings = async (userId, query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const [bookings, total] = await Promise.all([
    ConsultancyBooking.find({ user: userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('slot').lean(),
    ConsultancyBooking.countDocuments({ user: userId }),
  ]);
  return { bookings: bookings.map(presentBooking), page, limit, total };
};

const getMyBookingById = async (userId, id) => {
  const booking = await ConsultancyBooking.findOne({ _id: id, user: userId }).populate('slot').lean();
  if (!booking) {
    throw new AppError(AUTH_MESSAGES.CONSULTANCY_BOOKING_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }
  return presentBooking(booking);
};

// ── Admin: config + fee ───────────────────────────────────────────────────────

const getConsultancyConfig = async () => {
  const [fee, { schedule, slotIntervalMinutes }] = await Promise.all([
    pricingSettingService.getConsultancyFee(),
    getWeeklySchedule(),
  ]);
  return { topics: CONSULTANCY_TOPICS, fee, schedule, slotIntervalMinutes, allowedSlotIntervals: ALLOWED_SLOT_INTERVALS };
};

const setConsultancyFee = (fee, adminId, req) => pricingSettingService.setConsultancyFee(fee, adminId, req);

// ── Admin: bookings list/detail/status ────────────────────────────────────────

const presentAdminBooking = (b) => ({
  id: b._id,
  user: b.user && typeof b.user === 'object' ? { id: b.user._id, name: b.user.name, email: b.user.email } : null,
  topic: b.topic,
  requirement: b.requirement,
  resumeDocumentId: b.resumeDocument || null,
  slot: b.slot && typeof b.slot === 'object'
    ? { id: b.slot._id, date: b.slot.date, startTime: b.slot.startTime, endTime: b.slot.endTime }
    : { id: b.slot },
  status: b.status,
  adminNote: b.adminNote,
  createdAt: b.createdAt,
  statusUpdatedAt: b.statusUpdatedAt,
});

const listAdminBookings = async (query) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  if (query.status) filter.status = parseCsvFilter(query.status);
  if (query.topic) filter.topic = parseCsvFilter(query.topic);

  if (query.search) {
    const rx = buildRegex(query.search);
    const matchingUsers = await User.find({ $or: [{ name: rx }, { email: rx }, { phone: rx }] }).select('_id').lean();
    filter.user = { $in: matchingUsers.map((u) => u._id) };
  }

  const [bookings, total] = await Promise.all([
    ConsultancyBooking.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name email')
      .populate('slot')
      .lean(),
    ConsultancyBooking.countDocuments(filter),
  ]);

  return { bookings: bookings.map(presentAdminBooking), page, limit, total };
};

const getAdminBookingById = async (id) => {
  const booking = await ConsultancyBooking.findById(id).populate('user', 'name email').populate('slot').lean();
  if (!booking) {
    throw new AppError(AUTH_MESSAGES.CONSULTANCY_BOOKING_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }
  return presentAdminBooking(booking);
};

const updateBookingStatus = async (id, { status, note }, adminId, req) => {
  const booking = await ConsultancyBooking.findById(id);
  if (!booking) {
    throw new AppError(AUTH_MESSAGES.CONSULTANCY_BOOKING_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }
  if (booking.status !== 'awaiting_confirmation') {
    throw new AppError(AUTH_MESSAGES.CONSULTANCY_BOOKING_INVALID_STATUS_TRANSITION, HTTP_STATUS.BAD_REQUEST, 'INVALID_TRANSITION');
  }

  booking.status = status;
  booking.adminNote = note || null;
  booking.statusUpdatedAt = new Date();
  booking.statusUpdatedBy = adminId;
  await booking.save();

  // A rejected booking never happens — release its slot so the time becomes
  // bookable again. 'released' (not deleted) so this booking's own
  // .populate('slot') keeps resolving to a real document for historical
  // display (see the model's comment for why deleting would crash).
  if (status === 'rejected') {
    await ConsultancySlot.updateOne({ _id: booking.slot }, { $set: { status: 'released' } });
  }

  const [user, slot] = await Promise.all([
    User.findById(booking.user).select('name email'),
    ConsultancySlot.findById(booking.slot).select('date startTime endTime').lean(),
  ]);
  if (user) {
    const isConfirmed = status === 'confirmed';
    const notifType = isConfirmed
      ? notificationService.NOTIFICATION_TYPES.CONSULTANCY_BOOKING_CONFIRMED
      : notificationService.NOTIFICATION_TYPES.CONSULTANCY_BOOKING_REJECTED;
    const title = isConfirmed ? 'Consultancy booking confirmed' : 'Consultancy booking update';
    const body = isConfirmed
      ? 'Your consultancy session has been confirmed — check your email for details.'
      : 'Your consultancy booking request could not be confirmed.';

    await notificationService.create({
      userId: user._id,
      type: notifType,
      title,
      body,
      data: { bookingId: booking._id },
    });

    // Fire-and-forget, same contract as adminApplication.controller.js's
    // status email — must never block or fail the status-update response.
    if (user.email) {
      emailService
        .sendConsultancyBookingStatusEmail({
          to: user.email,
          name: user.name,
          isConfirmed,
          note,
          topic: booking.topic,
          slotDate: slot?.date,
          slotTime: slot?.startTime,
        })
        .catch(() => {});
    }
  }

  audit(AUDIT_EVENTS.CONSULTANCY_BOOKING_STATUS_CHANGED, adminId, req, { bookingId: booking._id, status });

  return getAdminBookingById(booking._id);
};

module.exports = {
  // user-facing
  getAvailability,
  getSlotsForDate,
  getFee,
  createBookingOrder,
  verifyPayment,
  activateBooking, // exported for payment.service.js's type-dispatch (reconcile + webhook)
  listMyBookings,
  getMyBookingById,
  // admin-facing
  getConsultancyConfig,
  setConsultancyFee,
  getWeeklySchedule,
  updateWeeklySchedule,
  listAdminBookings,
  getAdminBookingById,
  updateBookingStatus,
};
