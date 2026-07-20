'use strict';

const User = require('../models/user.model');
const Job = require('../models/job.model');
const { presentJob } = require('./job.service');
const notificationService = require('./notification.service');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

// Newest-saved-first isn't tracked (no per-save timestamp) — savedJobs is a
// plain ref array, so this reverses insertion order as a reasonable proxy.
const listSavedJobs = async (userId) => {
  const user = await User.findById(userId).select('savedJobs').populate('savedJobs').lean();
  const jobs = (user?.savedJobs || []).filter(Boolean).reverse();
  return jobs.map(presentJob);
};

const saveJob = async (userId, jobId) => {
  const job = await Job.findById(jobId).select('_id').lean();
  if (!job) {
    throw new AppError(AUTH_MESSAGES.JOB_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }
  await User.updateOne({ _id: userId }, { $addToSet: { savedJobs: jobId } });
};

const removeSavedJob = async (userId, jobId) => {
  await User.updateOne({ _id: userId }, { $pull: { savedJobs: jobId } });
};

// Called whenever a job becomes unavailable to applicants (status moves away
// from 'published', or the job is deleted) — silently unsaving it for every
// user who'd saved it isn't enough on its own, since they'd have no way of
// knowing why it disappeared, so each affected user also gets a notification.
// Safe to call even if no one saved this job (no-op) or repeatedly for the
// same job (later calls just find zero remaining affected users).
const notifyAndRemoveUnavailableJob = async (job) => {
  const affectedUsers = await User.find({ savedJobs: job._id }).select('_id').lean();
  if (!affectedUsers.length) return;

  await User.updateMany({ savedJobs: job._id }, { $pull: { savedJobs: job._id } });

  await Promise.all(
    affectedUsers.map((user) =>
      notificationService.create({
        userId: user._id,
        type: notificationService.NOTIFICATION_TYPES.SAVED_JOB_UNAVAILABLE,
        title: 'Saved Job No Longer Available',
        body: `"${job.title}" is no longer available and has been removed from your saved jobs.`,
        data: { jobId: String(job._id) },
      })
    )
  );
};

module.exports = { listSavedJobs, saveJob, removeSavedJob, notifyAndRemoveUnavailableJob };
