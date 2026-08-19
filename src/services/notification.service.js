'use strict';

const mongoose = require('mongoose');
const Notification = require('../models/notification.model');
const User = require('../models/user.model');
const pushService = require('./push.service');
const emailService = require('./email.service');
const { mapWithConcurrency } = require('../utils/concurrency.util');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');
const { ROLES } = require('../constants/roles');
const { PLAN_TIERS, TIER_RANK } = require('../models/plan.model');

/**
 * Creates a notification for a user and fires a push send in the background.
 *
 * This function never throws — a notification-creation failure must not
 * interrupt the caller's primary action (e.g. an admin changing an
 * application's status). Mirrors audit.service.js's fire-and-forget contract.
 *
 * The push send is deliberately NOT awaited — it's a network call with
 * unpredictable latency, and blocking the caller's response on it would be
 * a regression (see push.service.js, which itself never throws either).
 *
 * Admin-only types (see Notification.ADMIN_ONLY_TYPES) skip the push
 * entirely — the in-app record is still created (the admin panel reads it
 * unfiltered), but nothing pushes to a phone. Without this, notifyAdmins()
 * would push every admin's device for someone else's support ticket / new
 * signup / new application, etc. — reaching an admin's personal phone with
 * data about another user's activity regardless of whether the admin panel
 * is even what they're using at that moment.
 */
const create = async ({ userId, type, title, body, data = null }) => {
  try {
    const notification = await Notification.create({ user: userId, type, title, body, data });
    if (!Notification.ADMIN_ONLY_TYPES.includes(type)) {
      pushService.sendToUser(userId, { title, body, data }).catch(() => {});
    }
    return notification;
  } catch (err) {
    console.error('NotificationService: failed to create notification:', err.message);
    return null;
  }
};

/**
 * Notifies every active admin — "the admin" isn't a single user, so this
 * creates one independent Notification doc per admin (own read/unread state
 * each) rather than trying to share a single doc across recipients.
 *
 * Never throws, same contract as create().
 */
const notifyAdmins = async ({ type, title, body, data = null }) => {
  try {
    const admins = await User.find({ role: ROLES.ADMIN, isActive: true }).select('_id');
    await Promise.all(admins.map((admin) => create({ userId: admin._id, type, title, body, data })));
  } catch (err) {
    console.error('NotificationService: failed to notify admins:', err.message);
  }
};

// ── Job-alert fan-out ─────────────────────────────────────────────────────────
//
// How many users are held in memory, and written, at a time. 500 keeps the
// insertMany payload well inside MongoDB's 16 MB limit (a notification doc is a
// few hundred bytes) while keeping the number of round trips small.
const FANOUT_BATCH_SIZE = 500;

// Concurrent push/email sends within a batch. These are outbound calls to
// Firebase and the mail provider, so this is really a politeness limit on how
// hard we hammer them — high enough that a 500-user batch drains quickly, low
// enough that a large fan-out cannot exhaust sockets or trip provider rate
// limits. Deliberately NOT the same as the batch size.
const FANOUT_SEND_CONCURRENCY = 20;

/**
 * Notifies every user whose active subscription tier qualifies for this job
 * (same "at least this tier" rule application.service.js gates applying with —
 * see plan.model.js's isTierSufficient/TIER_RANK) that it was just posted, plus
 * anyone who opted into the job's category via User.preferredCategories. One
 * independent Notification doc per eligible user, same shape as notifyAdmins()
 * above. Never throws — a job-posting request must succeed regardless of how
 * many (or how few) users end up notified.
 *
 * Channel is tier-gated, matching the Plan.features copy shown on the
 * Subscription screen: Crew Start is "Job alerts (App)" — in-app/push only —
 * while Premium and Elite (both "Email + App") also get an email via
 * emailService. Premium and Elite are intentionally identical here — Elite
 * differentiates via its uncapped application limit, not an extra channel. The
 * in-app notification (and its push send) always fires regardless of tier;
 * email is the one tier-gated extra channel.
 *
 * ALL OF THAT USER-VISIBLE BEHAVIOUR IS UNCHANGED. What changed is how the work
 * is executed.
 *
 * Previously: two unbounded find()s loaded every matching user into memory,
 * merged them through a JS Map, then ran ONE unbounded Promise.all over the
 * whole set — a Notification.create(), a push (which re-fetched that same user
 * by id), and an email, per person. At 500 users that is fine. At 20,000 it is
 * an event-loop stall, a memory spike, 20,000 extra queries, and an immediate
 * rate-limit block from the mail provider. It also failed as a unit: one
 * rejection abandoned every task that had not yet settled.
 *
 * Now:
 *   ONE $or query, streamed through a cursor   (MongoDB does the union AND the
 *                                               de-duplication)
 *        -> batches of FANOUT_BATCH_SIZE
 *             -> insertMany(ordered: false)     one write per batch, not per user
 *             -> bounded-concurrency sends      push + email, failures isolated
 *
 * Still fire-and-forget from job.service, so publishing a job never waits on it.
 */
const notifyEligibleUsersForJob = async (job) => {
  try {
    const minRank = TIER_RANK[job.minimumTier] || TIER_RANK.start;
    const qualifyingTiers = PLAN_TIERS.filter((tier) => TIER_RANK[tier] >= minRank);

    // Two independent match reasons — plan-tier eligibility, and a user's own
    // opted-in category preferences — expressed as a single $or so the database
    // performs the union and the de-duplication. Previously these were two
    // separate queries merged through a Map keyed on _id; $or returns each
    // document exactly once even when it matches both arms, which is the same
    // no-duplicates guarantee with none of the memory. Both arms are
    // index-backed — see the fan-out indexes in user.model.js.
    const matchReasons = [
      { subscriptionStatus: 'active', subscriptionTier: { $in: qualifyingTiers } },
    ];
    if (job.category) matchReasons.push({ preferredCategories: job.category });

    const title = 'New job posted';
    const body = `${job.title} at ${job.companyName} was just posted for ${job.rank} — ${job.department}.`;
    const data = { jobId: job._id };

    // deviceTokens/pushNotificationsEnabled are select:false, so they have to be
    // asked for explicitly. Loading them here is what lets pushService skip its
    // own per-user lookup (see sendToUser's preloadedUser argument): it trades
    // this query's index-only coverage for the removal of N extra round trips,
    // which is overwhelmingly the better deal on a fan-out.
    const cursor = User.find({ $or: matchReasons })
      .select('_id email subscriptionTier +deviceTokens +pushNotificationsEnabled')
      .lean()
      .cursor({ batchSize: FANOUT_BATCH_SIZE });

    let batch = [];
    let totalNotified = 0;
    let totalFailedSends = 0;

    const flush = async () => {
      if (batch.length === 0) return;
      const users = batch;
      batch = [];

      // One write for the whole batch instead of one per user. ordered:false so
      // a single rejected document (e.g. a user deleted mid-fan-out) does not
      // abort the remainder — failure isolation enforced by the database rather
      // than by us.
      try {
        const inserted = await Notification.insertMany(
          users.map((u) => ({
            user: u._id,
            type: Notification.NOTIFICATION_TYPES.NEW_JOB_MATCH,
            title,
            body,
            data,
          })),
          { ordered: false }
        );
        totalNotified += inserted.length;
      } catch (err) {
        // With ordered:false the driver still throws when ANY document fails,
        // but the successful ones are already written. Count what landed and
        // carry on rather than discarding the batch.
        totalNotified += err?.insertedDocs?.length ?? 0;
        console.error('NotificationService: partial batch insert:', err.message);
      }

      // Push + email, bounded and individually isolated: one user's dead device
      // token or bouncing mailbox must not stop anyone else being told.
      const sends = await mapWithConcurrency(users, FANOUT_SEND_CONCURRENCY, async (u) => {
        // Third argument is the already-loaded user, so pushService does not
        // re-query. pushNotificationsEnabled is respected exactly as before.
        await pushService.sendToUser(u._id, { title, body, data }, u);

        if (u.subscriptionTier !== 'start') {
          await emailService.sendJobAlertEmail(u.email, job);
        }
      });
      totalFailedSends += sends.failed;
    };

    for await (const user of cursor) {
      batch.push(user);
      if (batch.length >= FANOUT_BATCH_SIZE) await flush();
    }
    await flush();

    if (totalNotified > 0 || totalFailedSends > 0) {
      console.log(
        `NotificationService: job ${job._id} — notified ${totalNotified} user(s)`
        + (totalFailedSends ? `, ${totalFailedSends} send(s) failed` : '')
      );
    }
  } catch (err) {
    console.error('NotificationService: failed to notify eligible users for job:', err.message);
  }
};

// Accepts either a single type or a comma-separated list (e.g. the admin
// panel asks for "APPLICATION_SUBMITTED,SUBSCRIPTION_PURCHASED,USER_REGISTERED")
// — mirrors application.service.js's parseCsvFilter().
const parseCsvFilter = (value) => {
  const tokens = String(value).split(',').map((v) => v.trim()).filter(Boolean);
  return tokens.length > 1 ? { $in: tokens } : tokens[0];
};

// This user's own "hide notifications older than N days" preference (see
// User.notificationExpiryDays) — a query-time filter, NOT the actual DB TTL
// cleanup (that's a fixed 15-day ceiling shared by everyone, see
// notification.model.js). Defaults to 10 for every user (admins included —
// they have no UI to change this), matching the app's pre-existing 10-day
// behavior exactly, so this is a no-op change for anyone who hasn't opted
// into a shorter/longer window.
const getExpiryCutoff = async (userId) => {
  const user = await User.findById(userId).select('notificationExpiryDays');
  const expiryDays = user?.notificationExpiryDays ?? 10;
  return new Date(Date.now() - expiryDays * 24 * 60 * 60 * 1000);
};

const listForUser = async (userId, { page = 1, limit = 20, type } = {}) => {
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
  const skip = (pageNum - 1) * limitNum;

  const filter = { user: userId, createdAt: { $gte: await getExpiryCutoff(userId) } };
  if (type) filter.type = parseCsvFilter(type);

  const [notifications, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    Notification.countDocuments(filter),
  ]);

  return { notifications, page: pageNum, limit: limitNum, total };
};

const getUnreadCount = async (userId, { type } = {}) => {
  const filter = { user: userId, read: false, createdAt: { $gte: await getExpiryCutoff(userId) } };
  if (type) filter.type = parseCsvFilter(type);
  return Notification.countDocuments(filter);
};

// Powers the admin panel's per-section sidebar badges (Users/Applications/
// Subscriptions/Consultancy each show their own unread count) — one grouped
// query instead of one countDocuments() per section.
const getUnreadCountsByType = async (userId) => {
  const cutoff = await getExpiryCutoff(userId);
  const rows = await Notification.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(String(userId)), read: false, createdAt: { $gte: cutoff } } },
    { $group: { _id: '$type', count: { $sum: 1 } } },
  ]);
  return Object.fromEntries(rows.map((r) => [r._id, r.count]));
};

const getNotificationSettings = async (userId) => {
  const user = await User.findById(userId).select('notificationExpiryDays pushNotificationsEnabled');
  return {
    notificationExpiryDays: user?.notificationExpiryDays ?? 10,
    pushNotificationsEnabled: user?.pushNotificationsEnabled ?? true,
  };
};

// Both fields are optional so the mobile settings screen can send just the
// one the user actually changed — see notification.validation.js's
// updateSettings, which allows either/both.
const updateNotificationSettings = async (userId, { notificationExpiryDays, pushNotificationsEnabled } = {}) => {
  const update = {};
  if (notificationExpiryDays !== undefined) update.notificationExpiryDays = notificationExpiryDays;
  if (pushNotificationsEnabled !== undefined) update.pushNotificationsEnabled = pushNotificationsEnabled;

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: update },
    { new: true, select: 'notificationExpiryDays pushNotificationsEnabled' }
  );
  return {
    notificationExpiryDays: user.notificationExpiryDays,
    pushNotificationsEnabled: user.pushNotificationsEnabled,
  };
};

const markRead = async (userId, notificationId) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, user: userId },
    { read: true, readAt: new Date() },
    { new: true }
  );

  if (!notification) {
    throw new AppError(AUTH_MESSAGES.NOTIFICATION_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  return notification;
};

// `type` is optional so the admin panel can clear just one section's badge
// (e.g. visiting Applications marks only APPLICATION_SUBMITTED notifications
// read) without dismissing the other sections' unread counts — the existing
// "mark everything read" bell-dropdown action still works unchanged by
// simply omitting it.
const markAllRead = async (userId, { type } = {}) => {
  const filter = { user: userId, read: false };
  if (type) filter.type = parseCsvFilter(type);
  await Notification.updateMany(filter, { read: true, readAt: new Date() });
};

// A physical device's FCM token can only ever belong to ONE currently-logged-
// in account. Reclaiming it from every OTHER user first — not just this
// one's own array — is what makes this correct regardless of how a previous
// session on this device ended (explicit logout, account block, a dead
// refresh token, or the app just being force-quit/reinstalled with no
// deregister call at all). Without this, a device that's ever been through
// more than one account keeps every earlier account's token registered
// forever, and every one of THEIR notifications keeps pushing to this one
// phone — which is exactly why a push could be seen for something totally
// unrelated to the currently logged-in user, while the in-app list (correctly
// scoped to the logged-in user's own Notification docs) stays empty for it.
const registerDeviceToken = async (userId, { token, platform }) => {
  await User.updateMany(
    { _id: { $ne: userId }, 'deviceTokens.token': token },
    { $pull: { deviceTokens: { token } } }
  );
  await User.updateOne({ _id: userId }, { $pull: { deviceTokens: { token } } });
  await User.updateOne({ _id: userId }, { $push: { deviceTokens: { token, platform, createdAt: new Date() } } });
};

const deregisterDeviceToken = async (userId, token) => {
  await User.updateOne({ _id: userId }, { $pull: { deviceTokens: { token } } });
};

module.exports = {
  create,
  notifyAdmins,
  notifyEligibleUsersForJob,
  listForUser,
  getUnreadCount,
  getUnreadCountsByType,
  markRead,
  markAllRead,
  getNotificationSettings,
  updateNotificationSettings,
  registerDeviceToken,
  deregisterDeviceToken,
  NOTIFICATION_TYPES: Notification.NOTIFICATION_TYPES,
};
