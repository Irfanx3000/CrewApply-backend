'use strict';

const Job = require('../models/job.model');
const Application = require('../models/application.model');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

// ── Status lifecycle ─────────────────────────────────────────────────────────

// Deliberately simple: 3 statuses, freely movable between all of them in
// either direction — no linear pipeline to reason about.
const STATUS_TRANSITIONS = Object.freeze({
  draft: ['published', 'archived'],
  published: ['draft', 'archived'],
  archived: ['draft', 'published'],
});

// Fields an admin is allowed to set — never spread req.body directly onto the model.
const ALLOWED_JOB_FIELDS = [
  'title',
  'companyName',
  'companyLogoUrl',
  'department',
  'rank',
  'designation',
  'vesselType',
  'location',
  'employmentType',
  'experience',
  'salary',
  'description',
  'requiredDocuments',
  'joiningDate',
  'applicationDeadline',
  'featured',
  'minimumTier',
];

const pick = (source, fields) =>
  fields.reduce((acc, field) => {
    if (Object.prototype.hasOwnProperty.call(source, field)) acc[field] = source[field];
    return acc;
  }, {});

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Reshapes a job document for API responses: nests company info as
 * `company: { name, logoUrl }` so a future Company model can replace the flat
 * fields without changing the response contract.
 */
const presentJob = (job) => {
  const { companyName, companyLogoUrl, ...rest } = job;
  return {
    ...rest,
    // .lean() reads skip schema defaults — jobs created before this field
    // existed would otherwise come back `undefined` instead of "no requirement".
    requiredDocuments: rest.requiredDocuments || [],
    company: { name: companyName, logoUrl: companyLogoUrl },
  };
};

const parsePagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
};

const parseBoolean = (value) => {
  if (value === undefined) return undefined;
  return value === true || value === 'true';
};

// Turns "Deck" into "Deck" and "Deck,Engine" into { $in: ["Deck","Engine"] } —
// lets a single query param serve both a single-select and multi-select filter.
const parseCsvFilter = (value) => {
  const tokens = String(value).split(',').map((v) => v.trim()).filter(Boolean);
  return tokens.length > 1 ? { $in: tokens } : tokens[0];
};

// ── Public (mobile) ───────────────────────────────────────────────────────────

const listPublicJobs = async (query) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = { status: 'published' };

  if (query.department) filter.department = parseCsvFilter(query.department);
  if (query.vesselType) filter.vesselType = parseCsvFilter(query.vesselType);
  if (query.employmentType) filter.employmentType = query.employmentType;
  if (query.rank) filter.rank = new RegExp(`^${escapeRegex(query.rank.trim())}$`, 'i');
  if (query.country) filter['location.country'] = new RegExp(`^${escapeRegex(query.country.trim())}$`, 'i');

  const featured = parseBoolean(query.featured);
  if (featured !== undefined) filter.featured = featured;

  const minSalary = query.minSalary !== undefined ? Number(query.minSalary) : undefined;
  const maxSalary = query.maxSalary !== undefined ? Number(query.maxSalary) : undefined;
  if (minSalary !== undefined) filter['salary.max'] = { $gte: minSalary };
  if (maxSalary !== undefined) filter['salary.min'] = { $lte: maxSalary };

  if (query.search) filter.$text = { $search: query.search };

  const sort = query.sort === 'salary' ? { 'salary.max': -1 } : { publishedAt: -1 };

  const [jobs, total] = await Promise.all([
    Job.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Job.countDocuments(filter),
  ]);

  return { jobs: jobs.map(presentJob), page, limit, total };
};

const getPublicJobById = async (id) => {
  const job = await Job.findOne({ _id: id, status: 'published' }).lean();
  return job ? presentJob(job) : null;
};

// ── Admin ─────────────────────────────────────────────────────────────────────

const listAdminJobs = async (query) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  if (query.status) filter.status = query.status;
  if (query.department) filter.department = parseCsvFilter(query.department);
  if (query.vesselType) filter.vesselType = parseCsvFilter(query.vesselType);
  if (query.rank) filter.rank = new RegExp(`^${escapeRegex(query.rank.trim())}$`, 'i');
  if (query.country) filter['location.country'] = new RegExp(`^${escapeRegex(query.country.trim())}$`, 'i');
  if (query.search) filter.$text = { $search: query.search };

  const [jobs, total] = await Promise.all([
    Job.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Job.countDocuments(filter),
  ]);

  return { jobs: jobs.map(presentJob), page, limit, total };
};

const getAdminJobById = async (id) => {
  const job = await Job.findById(id).lean();
  return job ? presentJob(job) : null;
};

const createJob = async (data, userId) => {
  // 'status' is deliberately NOT in ALLOWED_JOB_FIELDS — that list is shared
  // with updateJob, and letting it through there would bypass updateStatus's
  // transition rules entirely. Handled explicitly here instead, restricted to
  // the two sensible initial states (validated in job.validation.js).
  const status = data.status === 'published' ? 'published' : 'draft';
  const job = await Job.create({
    ...pick(data, ALLOWED_JOB_FIELDS),
    status,
    publishedAt: status === 'published' ? new Date() : undefined,
    createdBy: userId,
  });
  return presentJob(job.toObject());
};

const updateJob = async (id, data, userId) => {
  const job = await Job.findById(id);
  if (!job) {
    throw new AppError(AUTH_MESSAGES.JOB_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  Object.assign(job, pick(data, ALLOWED_JOB_FIELDS));
  job.updatedBy = userId;
  await job.save();

  return presentJob(job.toObject());
};

const updateStatus = async (id, nextStatus, userId) => {
  const job = await Job.findById(id);
  if (!job) {
    throw new AppError(AUTH_MESSAGES.JOB_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  const allowed = STATUS_TRANSITIONS[job.status] || [];
  if (!allowed.includes(nextStatus)) {
    const message = AUTH_MESSAGES.JOB_INVALID_STATUS_TRANSITION
      .replace('%s', job.status)
      .replace('%s', nextStatus);
    throw new AppError(message, HTTP_STATUS.BAD_REQUEST, 'INVALID_STATUS_TRANSITION');
  }

  job.status = nextStatus;
  if (nextStatus === 'published') job.publishedAt = new Date();
  job.updatedBy = userId;
  await job.save();

  return presentJob(job.toObject());
};

const deleteJob = async (id) => {
  const job = await Job.findById(id);
  if (!job) {
    throw new AppError(AUTH_MESSAGES.JOB_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  if (!['draft', 'archived'].includes(job.status)) {
    throw new AppError(AUTH_MESSAGES.JOB_DELETE_NOT_ALLOWED, HTTP_STATUS.BAD_REQUEST, 'DELETE_NOT_ALLOWED');
  }

  // A draft can never have applications (applying requires status ===
  // 'published'), but an archived job was published at some point and may
  // have real applicants — deleting it would leave their Applications
  // pointing at nothing, silently erasing "which job did I apply to" from
  // their history. Archive is the deliberate end state for that case; hard
  // delete is only for jobs no one ever actually applied to.
  const hasApplications = await Application.exists({ job: job._id });
  if (hasApplications) {
    throw new AppError(AUTH_MESSAGES.JOB_DELETE_HAS_APPLICATIONS, HTTP_STATUS.BAD_REQUEST, 'JOB_HAS_APPLICATIONS');
  }

  await job.deleteOne();
  return presentJob(job.toObject());
};

module.exports = {
  listPublicJobs,
  getPublicJobById,
  listAdminJobs,
  getAdminJobById,
  createJob,
  updateJob,
  updateStatus,
  deleteJob,
  presentJob,
};
