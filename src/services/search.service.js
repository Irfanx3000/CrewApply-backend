'use strict';

const User = require('../models/user.model');
const Job = require('../models/job.model');
const Application = require('../models/application.model');
const Referral = require('../models/referral.model');
const Subscription = require('../models/subscription.model');
const Notification = require('../models/notification.model');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');
const { buildRegex } = require('../utils/searchUtil');
const { ROLES } = require('../constants/roles');

const PER_ENTITY_LIMIT = 5;
const MIN_QUERY_LENGTH = 2;

// ── Per-entity search functions ───────────────────────────────────────────────
// Each returns already-limited, already-shaped rows: { id, title, subtitle, navigable }.
// `navigable: false` tells the frontend this result has nowhere to link to.

const searchUsers = async ({ rx }) => {
  const users = await User.find({
    role: { $in: [ROLES.USER, ROLES.EMPLOYER] },
    isDeleted: { $ne: true },
    $or: [{ name: rx }, { email: rx }, { phone: rx }],
  })
    .select('name email')
    .limit(PER_ENTITY_LIMIT)
    .lean();

  return users.map((u) => ({ id: String(u._id), title: u.name, subtitle: u.email, navigable: true }));
};

// Jobs have a Mongo text index (job.model.js) too, but $text only matches
// whole, tokenized (stemmed) words — it can't match a word someone is still
// typing (e.g. "engi" won't match "Engineer"). That makes it the wrong tool
// for a live-as-you-type suggestion dropdown, which is exactly how the
// mobile app's only 'app'-scoped entity is used (JobSearchBar). Matches
// every other entity handler in this file: a case-insensitive "contains"
// regex via buildRegex, across the same fields the text index covers.
const searchJobs = async ({ rx, scope }) => {
  const filter = {
    $or: [
      { title: rx },
      { companyName: rx },
      { department: rx },
      { rank: rx },
      { vesselType: rx },
      { 'location.city': rx },
      { 'location.country': rx },
    ],
  };
  if (scope === 'app') filter.status = 'published';

  const jobs = await Job.find(filter)
    .sort({ publishedAt: -1 })
    .select('title companyName status')
    .limit(PER_ENTITY_LIMIT)
    .lean();

  return jobs.map((j) => ({ id: String(j._id), title: j.title, subtitle: j.companyName, navigable: true }));
};

// Applications have no own free-text fields — resolve the matching applicant
// first, then filter by user id, mirroring the existing two-hop pattern in
// application.service.js's listAdminApplications.
const searchApplications = async ({ rx }) => {
  const matchingUsers = await User.find({ $or: [{ name: rx }, { email: rx }, { phone: rx }] }).select('_id').lean();
  if (!matchingUsers.length) return [];

  const applications = await Application.find({ user: { $in: matchingUsers.map((u) => u._id) } })
    .sort({ createdAt: -1 })
    .limit(PER_ENTITY_LIMIT)
    .populate('user', 'name email')
    .populate('job', 'title')
    .lean();

  return applications.map((a) => ({
    id: String(a._id),
    title: a.user?.name || 'Applicant',
    subtitle: a.job?.title ? `Applied to ${a.job.title}` : `Status: ${a.status}`,
    navigable: true,
  }));
};

// Same two-hop pattern as referral.service.js's listReferrals, plus a direct
// match on the referral code itself.
const searchReferrals = async ({ rx }) => {
  const matchingUsers = await User.find({ $or: [{ name: rx }, { email: rx }] }).select('_id').lean();
  const userIds = matchingUsers.map((u) => u._id);

  const referrals = await Referral.find({ $or: [{ referralCode: rx }, { referrer: { $in: userIds } }] })
    .sort({ createdAt: -1 })
    .limit(PER_ENTITY_LIMIT)
    .populate('referrer', 'name email')
    .lean();

  return referrals.map((r) => ({
    id: String(r._id),
    title: r.referralCode || 'Referral',
    subtitle: r.referrer?.name ? `Referred by ${r.referrer.name}` : `Status: ${r.status}`,
    navigable: true,
  }));
};

// Subscriptions have no own free-text fields either — same
// resolve-owning-user-first pattern. (Payments is intentionally not a search
// entity: the admin Payments page is a placeholder with no real UI yet — see
// Payments.jsx — so a Payment result would have nowhere to link to.)
const searchSubscriptions = async ({ rx }) => {
  const matchingUsers = await User.find({ $or: [{ name: rx }, { email: rx }] }).select('_id').lean();
  if (!matchingUsers.length) return [];

  const subscriptions = await Subscription.find({ user: { $in: matchingUsers.map((u) => u._id) } })
    .sort({ createdAt: -1 })
    .limit(PER_ENTITY_LIMIT)
    .populate('user', 'name email')
    .lean();

  return subscriptions.map((s) => ({
    id: String(s._id),
    title: s.user?.name || 'Subscription',
    subtitle: `${s.tier} · ${s.status}`,
    navigable: true,
  }));
};

// Notifications are per-user personal event records with no admin list page
// to link to (see notification.model.js) — surfaced as read-only context for
// support/troubleshooting, never navigable.
const searchNotifications = async ({ rx }) => {
  const notifications = await Notification.find({ $or: [{ title: rx }, { body: rx }] })
    .sort({ createdAt: -1 })
    .limit(PER_ENTITY_LIMIT)
    .populate('user', 'name email')
    .lean();

  return notifications.map((n) => ({
    id: String(n._id),
    title: n.title,
    subtitle: n.user ? `${n.user.name} (${n.user.email}) — ${n.body}` : n.body,
    navigable: false,
  }));
};

// ── Registry: which entities exist per scope ─────────────────────────────────
// 'admin' gets everything relevant to administering the platform; 'app' (the
// mobile crew-facing search) stays limited to what a crew member should see —
// today, just Jobs. Adding an entity to a scope is a one-line change here.
const ENTITY_HANDLERS = {
  users: { scopes: ['admin'], run: searchUsers },
  jobs: { scopes: ['admin', 'app'], run: searchJobs },
  applications: { scopes: ['admin'], run: searchApplications },
  referrals: { scopes: ['admin'], run: searchReferrals },
  subscriptions: { scopes: ['admin'], run: searchSubscriptions },
  notifications: { scopes: ['admin'], run: searchNotifications },
};

/**
 * Runs the same search across every entity in scope, in parallel, and
 * returns results grouped by entity type (never cross-ranked — a Mongo
 * textScore from Job isn't comparable to a regex boolean match from User).
 *
 * @param {{ query: string, scope: 'admin'|'app' }} params
 * @returns {Promise<Array<{ entityType: string, count: number, results: object[] }>>}
 */
const runSearch = async ({ query, scope }) => {
  const term = String(query || '').trim();
  if (term.length < MIN_QUERY_LENGTH) {
    throw new AppError(AUTH_MESSAGES.SEARCH_QUERY_TOO_SHORT, HTTP_STATUS.BAD_REQUEST, 'QUERY_TOO_SHORT');
  }

  const rx = buildRegex(term);
  const entityKeys = Object.keys(ENTITY_HANDLERS).filter((key) => ENTITY_HANDLERS[key].scopes.includes(scope));

  const groups = await Promise.all(
    entityKeys.map(async (key) => {
      const results = await ENTITY_HANDLERS[key].run({ rx, term, scope });
      return { entityType: key, count: results.length, results };
    })
  );

  return groups.filter((g) => g.count > 0);
};

module.exports = { runSearch };
