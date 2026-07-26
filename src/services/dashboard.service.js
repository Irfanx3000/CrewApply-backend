'use strict';

const User = require('../models/user.model');
const Job = require('../models/job.model');
const Application = require('../models/application.model');
const Payment = require('../models/payment.model');
const Subscription = require('../models/subscription.model');
const Plan = require('../models/plan.model');
const { ROLES } = require('../constants/roles');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');

// ── Summary (stat cards + plan distributions) ─────────────────────────────────

const getSummary = async () => {
  const now = new Date();

  const [
    revenueAgg,
    activeSubscribers,
    totalUsers,
    totalJobs,
    totalApplications,
    tierCountAgg,
    tierRevenueAgg,
    plans,
  ] = await Promise.all([
    Payment.aggregate([
      { $match: { status: 'paid', currency: 'INR' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Subscription.countDocuments({ status: 'active', currentPeriodEnd: { $gt: now } }),
    User.countDocuments({ role: { $in: [ROLES.USER, ROLES.EMPLOYER] }, isDeleted: { $ne: true } }),
    Job.countDocuments({}),
    Application.countDocuments({}),
    Subscription.aggregate([
      { $match: { status: 'active', currentPeriodEnd: { $gt: now } } },
      { $group: { _id: '$tier', count: { $sum: 1 } } },
    ]),
    Payment.aggregate([
      { $match: { status: 'paid', currency: 'INR' } },
      { $group: { _id: '$tier', total: { $sum: '$amount' } } },
    ]),
    Plan.find({ billingCycle: 'monthly' }).select('tier name').lean(),
  ]);

  const nameByTier = Object.fromEntries(plans.map((p) => [p.tier, p.name]));
  const tierCounts = Object.fromEntries(tierCountAgg.map((r) => [r._id, r.count]));
  const tierRevenue = Object.fromEntries(tierRevenueAgg.map((r) => [r._id, r.total]));

  const subscriberTotal = Object.values(tierCounts).reduce((a, b) => a + b, 0);
  const revenueTotal = Object.values(tierRevenue).reduce((a, b) => a + b, 0);

  const subscriptionPlanDistribution = Plan.PLAN_TIERS.map((tier) => {
    const count = tierCounts[tier] || 0;
    return {
      tier,
      name: nameByTier[tier] || tier,
      count,
      percent: subscriberTotal > 0 ? Math.round((count / subscriberTotal) * 100) : 0,
    };
  });

  const revenueByPlanDistribution = Plan.PLAN_TIERS.map((tier) => {
    const amount = tierRevenue[tier] || 0;
    return {
      tier,
      name: nameByTier[tier] || tier,
      amount,
      percent: revenueTotal > 0 ? Math.round((amount / revenueTotal) * 100) : 0,
    };
  });

  return {
    totalRevenueInr: revenueAgg[0]?.total || 0,
    activeSubscribers,
    totalUsers,
    totalJobs,
    totalApplications,
    subscriptionPlanDistribution,
    revenueByPlanDistribution,
  };
};

// ── Revenue Overview chart ────────────────────────────────────────────────────
//
// Buckets are built explicitly in JS (rather than via $dateTrunc) so every
// bucket boundary is known up front and can be zero-filled — the LineChart
// component draws a straight line between whatever points it's given with no
// concept of "missing" data, so an empty bucket must show as 0, not be
// silently skipped (which would misleadingly slope the line across the gap).

const METRICS = ['revenue', 'subscribers', 'applications', 'jobs'];
const RANGES = ['7d', '30d', '90d', '1y'];

const shortLabel = (date) => date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
const monthLabel = (date) => date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Returns { since, buckets: [{ start, end, label }] } — `end` is exclusive.
const buildBuckets = (range) => {
  const now = new Date();

  if (range === '1y') {
    // 12 real calendar months, oldest first — nicer labels than evenly-sliced
    // ~30.4-day windows, and matches how "1 Year" is normally read on a chart.
    const buckets = [];
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      buckets.push({ start, end, label: monthLabel(start) });
    }
    return { since: buckets[0].start, buckets };
  }

  // 7d/30d/90d: fixed-size day windows ending today (inclusive), oldest first.
  const CONFIG = { '7d': { days: 7, windowDays: 1 }, '30d': { days: 30, windowDays: 3 }, '90d': { days: 90, windowDays: 7 } };
  const { days, windowDays } = CONFIG[range];
  const todayStart = startOfDay(now);
  const rangeStart = new Date(todayStart.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

  const buckets = [];
  for (let cursor = new Date(rangeStart); cursor < now; cursor = new Date(cursor.getTime() + windowDays * 24 * 60 * 60 * 1000)) {
    const start = new Date(cursor);
    const end = new Date(cursor.getTime() + windowDays * 24 * 60 * 60 * 1000);
    buckets.push({ start, end, label: shortLabel(start) });
  }
  return { since: rangeStart, buckets };
};

const METRIC_SOURCE = {
  revenue: { model: Payment, match: { status: 'paid', currency: 'INR' }, valueOf: (doc) => doc.amount },
  subscribers: { model: Subscription, match: {}, valueOf: () => 1 },
  applications: { model: Application, match: {}, valueOf: () => 1 },
  jobs: { model: Job, match: {}, valueOf: () => 1 },
};

const getRevenueChart = async ({ metric, range }) => {
  if (!METRICS.includes(metric)) {
    throw new AppError('Invalid metric.', HTTP_STATUS.BAD_REQUEST, 'INVALID_METRIC');
  }
  if (!RANGES.includes(range)) {
    throw new AppError('Invalid range.', HTTP_STATUS.BAD_REQUEST, 'INVALID_RANGE');
  }

  const { since, buckets } = buildBuckets(range);
  const source = METRIC_SOURCE[metric];

  const docs = await source.model
    .find({ ...source.match, createdAt: { $gte: since } })
    .select('createdAt amount')
    .lean();

  const sums = new Array(buckets.length).fill(0);
  for (const doc of docs) {
    const createdAt = doc.createdAt.getTime();
    const index = buckets.findIndex((b) => createdAt >= b.start.getTime() && createdAt < b.end.getTime());
    if (index !== -1) sums[index] += source.valueOf(doc);
  }

  return {
    points: buckets.map((b, i) => ({ label: b.label, value: sums[i] })),
  };
};

module.exports = { getSummary, getRevenueChart };
