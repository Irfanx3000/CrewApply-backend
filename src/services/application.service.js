'use strict';

const mongoose = require('mongoose');
const Job = require('../models/job.model');
const Document = require('../models/document.model');
const Application = require('../models/application.model');
const { APPLICATION_STATUSES } = Application;
const User = require('../models/user.model');
const Subscription = require('../models/subscription.model');
const { isTierSufficient } = require('../models/plan.model');
const { hasActive } = require('../middleware/subscription.middleware');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');
const { escapeRegex } = require('../utils/searchUtil');

const JOB_POPULATE_FIELDS = 'title companyName companyLogoUrl location employmentType salary status applicationDeadline requiredDocuments';
const USER_APPLICANT_POPULATE_FIELDS =
  'name email phone avatar maritimeProfile.rank maritimeProfile.department maritimeProfile.designation maritimeProfile.currentVessel maritimeProfile.seaExperienceYears';
const SUBMITTED_DOCUMENT_POPULATE_FIELDS = 'originalName status createdAt';

const parsePagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
};

// Turns "selected" into "selected" and "selected,rejected" into { $in: [...] } —
// lets the admin "Closed" tab filter on multiple terminal statuses at once.
const parseCsvFilter = (value) => {
  const tokens = String(value).split(',').map((v) => v.trim()).filter(Boolean);
  return tokens.length > 1 ? { $in: tokens } : tokens[0];
};

const jobIsOpenForApplications = (job) =>
  job.status === 'published' && (!job.applicationDeadline || new Date(job.applicationDeadline) >= new Date());

/**
 * How many applications this user has submitted this calendar month against
 * their plan's limit — shared by the enforcement path (applyToJob),
 * eligibility (checkEligibility), and the global usage counter surfaced via
 * subscription.service.js's getMySubscription. Withdrawn applications don't
 * count (they free the slot), matching the duplicate-application check's
 * own semantics elsewhere in this file.
 *
 * `applicationLimit`/`applicationsRemaining` are null when the user's plan
 * has no cap (e.g. elite) or has no active subscription at all.
 */
const getApplicationUsage = async (user) => {
  const activeSub = await Subscription.findOne({
    user: user._id,
    status: 'active',
    currentPeriodEnd: { $gt: new Date() },
  }).populate('plan');

  const limit = activeSub?.plan?.jobApplicationLimit ?? null;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const applicationsUsed = await Application.countDocuments({
    user: user._id,
    createdAt: { $gte: monthStart },
    status: { $ne: 'withdrawn' },
  });

  return {
    applicationsUsed,
    applicationLimit: limit,
    applicationsRemaining: limit == null ? null : Math.max(0, limit - applicationsUsed),
  };
};

/**
 * Diffs a job's required document categories against the user's active
 * Documents. Empty `requiredDocuments` always satisfies (no gate).
 */
const getRequiredDocumentsStatus = async (userId, job) => {
  const requiredDocuments = job.requiredDocuments || [];
  if (!requiredDocuments.length) {
    return { requiredDocuments, missingDocuments: [], hasRequiredDocuments: true };
  }

  const activeDocs = await Document.find({
    user: userId,
    category: { $in: requiredDocuments },
    status: 'active',
  }).select('category').lean();

  const have = new Set(activeDocs.map((d) => d.category));
  const missingDocuments = requiredDocuments.filter((c) => !have.has(c));

  return { requiredDocuments, missingDocuments, hasRequiredDocuments: missingDocuments.length === 0 };
};

/**
 * Bulk, N+1-safe version of getRequiredDocumentsStatus for a page of admin
 * applications — computed LIVE against the applicant's current active
 * Documents (not the apply-time `submittedDocuments` snapshot, which is
 * always 100% by construction since applyToJob hard-blocks otherwise). This
 * is what lets the admin "Documents %" column surface staleness — e.g. a
 * document that's since been archived/replaced/expired after the user applied.
 */
const computeLiveDocumentCompleteness = async (applications) => {
  const userIds = [...new Set(applications.map((a) => String(a.user?._id ?? a.user)))];
  const allCategories = [...new Set(applications.flatMap((a) => a.job?.requiredDocuments || []))];

  const byUser = new Map();
  if (userIds.length && allCategories.length) {
    const activeDocs = await Document.find({
      user: { $in: userIds },
      category: { $in: allCategories },
      status: 'active',
    }).select('user category').lean();

    activeDocs.forEach((d) => {
      const key = String(d.user);
      if (!byUser.has(key)) byUser.set(key, new Set());
      byUser.get(key).add(d.category);
    });
  }

  const result = new Map();
  applications.forEach((application) => {
    const required = application.job?.requiredDocuments || [];
    const userId = String(application.user?._id ?? application.user);
    const have = byUser.get(userId) || new Set();
    const missingDocuments = required.filter((c) => !have.has(c));
    const percent = required.length
      ? Math.round(((required.length - missingDocuments.length) / required.length) * 100)
      : 100;
    result.set(String(application._id), { requiredDocuments: required, missingDocuments, percent });
  });
  return result;
};

/**
 * Reshapes an Application (with populated `job`) for API responses.
 */
const presentApplication = (application) => {
  const job = application.job && typeof application.job === 'object' ? application.job : null;
  return {
    id: application._id,
    status: application.status,
    appliedAt: application.createdAt,
    withdrawnAt: application.withdrawnAt,
    job: job
      ? {
          id: job._id,
          title: job.title,
          companyName: job.companyName,
          companyLogoUrl: job.companyLogoUrl,
          location: job.location,
          employmentType: job.employmentType,
          salary: job.salary,
          status: job.status,
          applicationDeadline: job.applicationDeadline,
        }
      : null,
  };
};

/**
 * Admin-facing reshape — extends presentApplication with applicant identity,
 * the submitted-document snapshot, and the live document-completeness check.
 * Nested refs always resolve to `id`, never `_id`, matching presentJob's
 * convention so the frontend service layer stays a thin passthrough.
 */
const presentAdminApplication = (application, completeness) => {
  const job = application.job && typeof application.job === 'object' ? application.job : null;
  const user = application.user && typeof application.user === 'object' ? application.user : null;

  return {
    id: application._id,
    status: application.status,
    appliedAt: application.createdAt,
    statusUpdatedAt: application.statusUpdatedAt,
    withdrawnAt: application.withdrawnAt,
    applicant: user
      ? {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          avatar: user.avatar,
          rank: user.maritimeProfile?.rank ?? null,
          department: user.maritimeProfile?.department ?? null,
          designation: user.maritimeProfile?.designation ?? null,
          currentVessel: user.maritimeProfile?.currentVessel ?? null,
          seaExperienceYears: user.maritimeProfile?.seaExperienceYears ?? null,
        }
      : null,
    job: job
      ? {
          id: job._id,
          title: job.title,
          companyName: job.companyName,
          companyLogoUrl: job.companyLogoUrl,
          location: job.location,
          employmentType: job.employmentType,
          salary: job.salary,
          status: job.status,
          applicationDeadline: job.applicationDeadline,
        }
      : null,
    submittedDocuments: (application.submittedDocuments || []).map((sd) => ({
      category: sd.category,
      document:
        sd.document && typeof sd.document === 'object'
          ? { id: sd.document._id, originalName: sd.document.originalName, status: sd.document.status, uploadedAt: sd.document.createdAt }
          : null,
    })),
    documentCompleteness: {
      requiredDocuments: completeness?.requiredDocuments ?? [],
      missingDocuments: completeness?.missingDocuments ?? [],
      percent: completeness?.percent ?? 100,
    },
  };
};

// ── Eligibility (never throws for missing subscription/documents) ────────────

const checkEligibility = async (user, jobId) => {
  const job = await Job.findById(jobId).lean();
  if (!job) {
    throw new AppError(AUTH_MESSAGES.JOB_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  const [documentsStatus, alreadyApplied, usage] = await Promise.all([
    getRequiredDocumentsStatus(user._id, job),
    Application.exists({ user: user._id, job: jobId, status: { $ne: 'withdrawn' } }),
    getApplicationUsage(user),
  ]);

  const hasActiveSubscription = hasActive(user);
  const jobIsOpen = jobIsOpenForApplications(job);
  const meetsTierRequirement = isTierSufficient(user.subscriptionTier, job.minimumTier);
  const withinLimit = usage.applicationsRemaining == null || usage.applicationsRemaining > 0;

  return {
    eligible:
      hasActiveSubscription &&
      documentsStatus.hasRequiredDocuments &&
      jobIsOpen &&
      !alreadyApplied &&
      meetsTierRequirement &&
      withinLimit,
    hasActiveSubscription,
    hasRequiredDocuments: documentsStatus.hasRequiredDocuments,
    requiredDocuments: documentsStatus.requiredDocuments,
    missingDocuments: documentsStatus.missingDocuments,
    jobIsOpen,
    alreadyApplied: !!alreadyApplied,
    meetsTierRequirement,
    jobMinimumTier: job.minimumTier,
    userTier: user.subscriptionTier,
    applicationsUsed: usage.applicationsUsed,
    applicationLimit: usage.applicationLimit,
    applicationsRemaining: usage.applicationsRemaining,
  };
};

// ── Apply (hard-fails with distinct errors) ───────────────────────────────────

const applyToJob = async (user, jobId) => {
  const job = await Job.findById(jobId);
  if (!job) {
    throw new AppError(AUTH_MESSAGES.JOB_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  if (!jobIsOpenForApplications(job)) {
    throw new AppError(AUTH_MESSAGES.JOB_NOT_OPEN_FOR_APPLICATIONS, HTTP_STATUS.BAD_REQUEST, 'JOB_NOT_OPEN');
  }

  // Any active subscription is already enforced by requireActiveSubscription
  // middleware on the route — these two checks are the tier- and quota-aware
  // gates on top of that. Tier first: cheaper, and a tier-blocked user
  // shouldn't be told "limit reached" instead of the real reason.
  if (!isTierSufficient(user.subscriptionTier, job.minimumTier)) {
    throw new AppError(AUTH_MESSAGES.SUBSCRIPTION_TIER_REQUIRED, HTTP_STATUS.FORBIDDEN, 'TIER_REQUIRED');
  }

  const usage = await getApplicationUsage(user);
  if (usage.applicationsRemaining != null && usage.applicationsRemaining <= 0) {
    throw new AppError(AUTH_MESSAGES.APPLICATION_LIMIT_REACHED, HTTP_STATUS.FORBIDDEN, 'APPLICATION_LIMIT_REACHED');
  }

  const already = await Application.exists({ user: user._id, job: job._id, status: { $ne: 'withdrawn' } });
  if (already) {
    throw new AppError(AUTH_MESSAGES.APPLICATION_ALREADY_EXISTS, HTTP_STATUS.CONFLICT, 'DUPLICATE_APPLICATION');
  }

  const requiredDocuments = job.requiredDocuments || [];
  let submittedDocuments = [];

  if (requiredDocuments.length) {
    const activeDocs = await Document.find({
      user: user._id,
      category: { $in: requiredDocuments },
      status: 'active',
    }).select('_id category').lean();

    const byCategory = new Map(activeDocs.map((d) => [d.category, d._id]));
    const missing = requiredDocuments.filter((c) => !byCategory.has(c));

    if (missing.length) {
      throw new AppError(
        AUTH_MESSAGES.MISSING_REQUIRED_DOCUMENTS,
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        'MISSING_REQUIRED_DOCUMENTS',
        missing.map((category) => ({ field: 'requiredDocuments', message: `Missing required document: ${category}.`, category }))
      );
    }

    submittedDocuments = requiredDocuments.map((category) => ({ category, document: byCategory.get(category) }));
  }

  let application;
  try {
    application = await Application.create({ user: user._id, job: job._id, submittedDocuments });
  } catch (err) {
    if (err.code === 11000) {
      throw new AppError(AUTH_MESSAGES.APPLICATION_ALREADY_EXISTS, HTTP_STATUS.CONFLICT, 'DUPLICATE_APPLICATION');
    }
    throw err;
  }

  await application.populate('job', JOB_POPULATE_FIELDS);
  return presentApplication(application.toObject());
};

// ── List / get / withdraw (applicant-facing) ──────────────────────────────────

const listMyApplications = async (userId, query) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = { user: userId };
  if (query.status) filter.status = query.status;

  const [applications, total] = await Promise.all([
    Application.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('job', JOB_POPULATE_FIELDS).lean(),
    Application.countDocuments(filter),
  ]);

  return { applications: applications.map(presentApplication), page, limit, total };
};

const getMyApplicationById = async (userId, applicationId) => {
  const application = await Application.findOne({ _id: applicationId, user: userId }).populate('job', JOB_POPULATE_FIELDS).lean();
  if (!application) {
    throw new AppError(AUTH_MESSAGES.APPLICATION_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }
  return presentApplication(application);
};

const withdrawApplication = async (userId, applicationId) => {
  const application = await Application.findOne({ _id: applicationId, user: userId });
  if (!application) {
    throw new AppError(AUTH_MESSAGES.APPLICATION_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  if (application.status === 'withdrawn' || ['selected', 'rejected'].includes(application.status)) {
    throw new AppError(AUTH_MESSAGES.APPLICATION_WITHDRAW_NOT_ALLOWED, HTTP_STATUS.BAD_REQUEST, 'WITHDRAW_NOT_ALLOWED');
  }

  application.status = 'withdrawn';
  application.withdrawnAt = new Date();
  application.statusUpdatedAt = new Date();
  await application.save();

  await application.populate('job', JOB_POPULATE_FIELDS);
  return presentApplication(application.toObject());
};

// ── Admin ─────────────────────────────────────────────────────────────────────

// Valid next-status transitions an admin can move an application to.
// `withdrawn` is user-initiated only — an admin can never move into or out
// of it. `selected`/`rejected` are terminal.
const STATUS_TRANSITIONS = Object.freeze({
  applied: ['under_review', 'rejected'],
  under_review: ['interview_scheduled', 'rejected'],
  interview_scheduled: ['selected', 'rejected'],
  selected: [],
  rejected: [],
  withdrawn: [],
});

const listAdminApplications = async (query) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  if (query.status) filter.status = parseCsvFilter(query.status);
  if (query.job) filter.job = query.job;

  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search.trim()), 'i');
    const matchingUsers = await User.find({ $or: [{ name: rx }, { email: rx }, { phone: rx }] }).select('_id').lean();
    filter.user = { $in: matchingUsers.map((u) => u._id) };
  }

  const sort = query.sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };

  const [applications, total] = await Promise.all([
    Application.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('job', JOB_POPULATE_FIELDS)
      .populate('user', USER_APPLICANT_POPULATE_FIELDS)
      .populate('submittedDocuments.document', SUBMITTED_DOCUMENT_POPULATE_FIELDS)
      .lean(),
    Application.countDocuments(filter),
  ]);

  const completenessByAppId = await computeLiveDocumentCompleteness(applications);
  return {
    applications: applications.map((a) => presentAdminApplication(a, completenessByAppId.get(String(a._id)))),
    page,
    limit,
    total,
  };
};

// Per-job status-count breakdown for the admin Job Detail page's "Application
// Statistics" panel. Pure aggregation over existing data — no schema changes.
const getJobApplicationStats = async (jobId) => {
  const rows = await Application.aggregate([
    { $match: { job: new mongoose.Types.ObjectId(jobId) } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const byStatus = Object.fromEntries(APPLICATION_STATUSES.map((status) => [status, 0]));
  let total = 0;
  for (const row of rows) {
    byStatus[row._id] = row.count;
    total += row.count;
  }

  return {
    total,
    byStatus,
    // "Shortlisted" groups the two positive-progress statuses past initial
    // review — matches how the admin UI already talks about applicants.
    shortlisted: byStatus.interview_scheduled + byStatus.selected,
  };
};

const getAdminApplicationById = async (id) => {
  const application = await Application.findById(id)
    .populate('job', JOB_POPULATE_FIELDS)
    .populate('user', USER_APPLICANT_POPULATE_FIELDS)
    .populate('submittedDocuments.document', SUBMITTED_DOCUMENT_POPULATE_FIELDS)
    .lean();
  if (!application) return null;

  const completenessByAppId = await computeLiveDocumentCompleteness([application]);
  return presentAdminApplication(application, completenessByAppId.get(String(application._id)));
};

const updateApplicationStatus = async (id, nextStatus) => {
  const application = await Application.findById(id);
  if (!application) {
    throw new AppError(AUTH_MESSAGES.APPLICATION_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  const allowed = STATUS_TRANSITIONS[application.status] || [];
  if (!allowed.includes(nextStatus)) {
    const message = AUTH_MESSAGES.APPLICATION_INVALID_STATUS_TRANSITION
      .replace('%s', application.status)
      .replace('%s', nextStatus);
    throw new AppError(message, HTTP_STATUS.BAD_REQUEST, 'INVALID_STATUS_TRANSITION');
  }

  application.status = nextStatus;
  application.statusUpdatedAt = new Date();
  await application.save();

  return getAdminApplicationById(application._id);
};

module.exports = {
  checkEligibility,
  applyToJob,
  getApplicationUsage,
  listMyApplications,
  getMyApplicationById,
  withdrawApplication,
  STATUS_TRANSITIONS,
  listAdminApplications,
  getAdminApplicationById,
  updateApplicationStatus,
  getJobApplicationStats,
};
