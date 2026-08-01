'use strict';

const cron = require('node-cron');
const Subscription = require('../models/subscription.model');
const notificationService = require('../services/notification.service');

// A user gets warned once their plan enters this window before expiry —
// kept in sync with RENEWAL_WINDOW_MS in subscription.service.js and
// RENEW_WINDOW_DAYS in the mobile app's subscriptionDisplay.js.
const RENEWAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const daysLeftOf = (currentPeriodEnd) =>
  Math.max(0, Math.ceil((new Date(currentPeriodEnd).getTime() - Date.now()) / MS_PER_DAY));

/**
 * Finds every active subscription that has entered its renewal window and
 * hasn't been notified yet this period, and sends one "expiring soon"
 * notification each. `renewalNotifiedAt` is set immediately after a
 * successful notify so tomorrow's run (or an overlapping manual trigger)
 * never double-sends — a failed individual notify is logged and simply
 * retried on the next scheduled run, not immediately.
 */
const runSubscriptionExpiryCheck = async () => {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + RENEWAL_WINDOW_MS);

  const expiring = await Subscription.find({
    status: 'active',
    currentPeriodEnd: { $gte: now, $lte: windowEnd },
    renewalNotifiedAt: null,
  }).select('user tier currentPeriodEnd');

  if (!expiring.length) return;

  console.log(`SubscriptionExpiryJob: ${expiring.length} subscription(s) entering the renewal window.`);

  await Promise.all(
    expiring.map(async (sub) => {
      try {
        const daysLeft = daysLeftOf(sub.currentPeriodEnd);
        await notificationService.create({
          userId: sub.user,
          type: notificationService.NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRING,
          title: 'Your plan is expiring soon',
          body:
            daysLeft <= 1
              ? 'Your subscription expires today. Renew now to keep uninterrupted access.'
              : `Your subscription expires in ${daysLeft} days. Renew now to keep uninterrupted access.`,
          data: { subscriptionId: sub._id, tier: sub.tier },
        });
        sub.renewalNotifiedAt = now;
        await sub.save();
      } catch (err) {
        console.error(`SubscriptionExpiryJob: failed to notify subscription ${sub._id}:`, err.message);
      }
    })
  );
};

/**
 * Registers the daily cron (09:00 server time). Called once from server.js
 * after the DB connects — this is the only scheduled job in this backend
 * today, so it's kept self-contained rather than introducing a generic
 * job-runner for a single job.
 */
const start = () => {
  cron.schedule('0 9 * * *', () => {
    runSubscriptionExpiryCheck().catch((err) => {
      console.error('SubscriptionExpiryJob: run failed:', err.message);
    });
  });
  console.log('SubscriptionExpiryJob: scheduled daily at 09:00 server time.');
};

module.exports = { start, runSubscriptionExpiryCheck };
