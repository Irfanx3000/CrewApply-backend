'use strict';

// Human-readable copy shared by the applicant-facing in-app notification and
// the status-change email — only the 4 statuses an admin can actually move an
// application into (see STATUS_TRANSITIONS in application.service.js) need an
// entry. Centralized here so both channels never drift out of sync.
//
// `rejected`'s body is deliberately NOT a label substitution like the others —
// a plain "is now rejected" reads harshly, so it gets fully custom, considerate
// wording instead.
const STATUS_NOTIFICATION_COPY = {
  under_review: {
    title: 'Application Under Review',
    body: (jobTitle) => `Your application for ${jobTitle} is now under review.`,
  },
  interview_scheduled: {
    title: 'Interview Scheduled',
    body: (jobTitle) => `Your application for ${jobTitle} has moved to the interview stage.`,
  },
  selected: {
    title: 'You Have Been Selected!',
    body: (jobTitle) => `Congratulations! You've been selected for ${jobTitle}.`,
  },
  rejected: {
    title: 'Application Update',
    body: (jobTitle) =>
      `Thank you for your interest in ${jobTitle}. We've decided to move forward with other candidates ` +
      `this time — we encourage you to keep exploring other opportunities that match your profile.`,
  },
};

module.exports = { STATUS_NOTIFICATION_COPY };
