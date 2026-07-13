'use strict';

const Job = require('../models/job.model');
const Document = require('../models/document.model');
const Application = require('../models/application.model');
const { hasActive } = require('../middleware/subscription.middleware');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

const JOB_POPULATE_FIELDS = 'title companyName companyLogoUrl location employmentType salary status applicationDeadline';

const parsePagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
};

const jobIsOpenForApplications = (job) =>
  job.status === 'published' && (!job.applicationDeadline || new Date(job.applicationDeadline) >= new Date());

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

// ── Eligibility (never throws for missing subscription/documents) ────────────

const checkEligibility = async (user, jobId) => {
  const job = await Job.findById(jobId).lean();
  if (!job) {
    throw new AppError(AUTH_MESSAGES.JOB_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  const [documentsStatus, alreadyApplied] = await Promise.all([
    getRequiredDocumentsStatus(user._id, job),
    Application.exists({ user: user._id, job: jobId, status: { $ne: 'withdrawn' } }),
  ]);

  const hasActiveSubscription = hasActive(user);
  const jobIsOpen = jobIsOpenForApplications(job);

  return {
    eligible: hasActiveSubscription && documentsStatus.hasRequiredDocuments && jobIsOpen && !alreadyApplied,
    hasActiveSubscription,
    hasRequiredDocuments: documentsStatus.hasRequiredDocuments,
    requiredDocuments: documentsStatus.requiredDocuments,
    missingDocuments: documentsStatus.missingDocuments,
    jobIsOpen,
    alreadyApplied: !!alreadyApplied,
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

  // Subscription is already enforced by requireActiveSubscription middleware on the route.

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

// ── List / get / withdraw ─────────────────────────────────────────────────────

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

module.exports = {
  checkEligibility,
  applyToJob,
  listMyApplications,
  getMyApplicationById,
  withdrawApplication,
};
