'use strict';

const { config } = require('../config');
const resendService = require('./resend.service');
const verificationEmail = require('../emails/templates/verificationEmail');
const resetPasswordOtpEmail = require('../emails/templates/resetPasswordOtpEmail');
const applicationStatusEmail = require('../emails/templates/applicationStatusEmail');
const otpEmail = require('../emails/templates/otpEmail');
const adminInviteEmail = require('../emails/templates/adminInviteEmail');
const jobAlertEmail = require('../emails/templates/jobAlertEmail');
const consultancyBookingStatusEmail = require('../emails/templates/consultancyBookingStatusEmail');
const subscriptionSuccessEmail = require('../emails/templates/subscriptionSuccessEmail');
const consultancyBookingReceivedEmail = require('../emails/templates/consultancyBookingReceivedEmail');
const { STATUS_NOTIFICATION_COPY } = require('../constants/applicationStatusCopy');

/**
 * Core send function shared by all email helpers below — every transactional
 * email in the app goes through the Resend API via resend.service.js. Never
 * throws (resend.service.js's send() already swallows its own errors), and
 * silently no-ops if RESEND_API_KEY isn't configured, same contract as job
 * alerts already had before this file existed.
 *
 * @param {{ to: string, subject: string, html: string }} options
 * @returns {Promise<void>}
 */
const sendEmail = ({ to, subject, html }) => resendService.send({ to, subject, html, from: config.email.from });

// ── Domain-specific helpers ───────────────────────────────────────────────────

/**
 * Sends the email verification email.
 *
 * @param {{ to: string, name: string, token: string }} params
 */
const sendVerificationEmail = async ({ to, name, token }) => {
  const verificationUrl = `${config.client.url}/verify-email/${token}`;

  await sendEmail({
    to,
    subject: 'Verify your email address — CrewApply',
    html: verificationEmail({ name, verificationUrl }),
  });
};

/**
 * Sends the password reset OTP email — a 6-digit code the user enters
 * in-app, not a link (there's no web app to hand a reset link off to).
 *
 * @param {{ to: string, name: string, otp: string }} params
 */
const sendPasswordResetOtpEmail = async ({ to, name, otp }) => {
  await sendEmail({
    to,
    subject: 'Reset your password — CrewApply',
    html: resetPasswordOtpEmail({ name, otp }),
  });
};

/**
 * Sends the applicant-facing email for an application status change.
 * No-op (returns without sending) for any status without copy — mirrors the
 * same guard already used for the in-app notification.
 *
 * @param {{ to: string, name: string, jobTitle: string, status: string }} params
 */
const sendApplicationStatusEmail = async ({ to, name, jobTitle, status }) => {
  const copy = STATUS_NOTIFICATION_COPY[status];
  if (!copy) return;

  await sendEmail({
    to,
    subject: `${copy.title} — CrewApply`,
    html: applicationStatusEmail({ name, title: copy.title, message: copy.body(jobTitle) }),
  });
};

/**
 * Sends a 6-digit OTP verification code by email (registration/account verification).
 *
 * @param {{ to: string, name: string, otp: string }} params
 */
const sendOtpEmail = async ({ to, name, otp }) => {
  await sendEmail({
    to,
    subject: 'Your verification code — CrewApply',
    html: otpEmail({ name, otp }),
  });
};

/**
 * Sends the admin-invite email — distinct subject/copy from sendOtpEmail even
 * though both deliver a 6-digit code, since this recipient is being invited
 * to administer the platform, not verifying their own signup.
 *
 * @param {{ to: string, otp: string }} params
 */
const sendAdminInviteEmail = async ({ to, otp }) => {
  const acceptUrl = `${config.adminClient.url}/accept-invite?email=${encodeURIComponent(to)}`;

  await sendEmail({
    to,
    subject: "You've been invited to CrewApply Admin",
    html: adminInviteEmail({ otp, acceptUrl }),
  });
};

/**
 * Sends a job-alert email to a Premium/Elite subscriber when a newly posted
 * job matches their plan. `job` is the raw Job document (not presentJob()'d)
 * — see notification.service.js#notifyEligibleUsersForJob, its only caller.
 *
 * @param {string} to
 * @param {object} job
 */
const sendJobAlertEmail = async (to, job) => {
  const location = job.location?.country
    ? `${job.location.city ? `${job.location.city}, ` : ''}${job.location.country}`
    : null;

  await sendEmail({
    to,
    subject: `New job matching your plan: ${job.title}`,
    html: jobAlertEmail({
      title: job.title,
      companyName: job.companyName,
      rank: job.rank,
      department: job.department,
      location,
    }),
  });
};

/**
 * Sends the consultancy booking confirmed/rejected email — triggered when an
 * admin resolves an "awaiting_confirmation" booking.
 *
 * @param {{ to: string, name: string, isConfirmed: boolean, note?: string }} params
 */
const sendConsultancyBookingStatusEmail = async ({ to, name, isConfirmed, note }) => {
  const title = isConfirmed
    ? 'Your CrewApply consultancy session is confirmed'
    : 'Update on your CrewApply consultancy booking';

  await sendEmail({
    to,
    subject: title,
    html: consultancyBookingStatusEmail({ name, isConfirmed, note }),
  });
};

/**
 * Sends the subscription-purchase-confirmation email once a payment
 * successfully activates a subscription.
 *
 * @param {{ to: string, name: string, planName: string, billingCycle: string, amount: number, currency: string, periodEnd: Date }} params
 *   `amount` is in the smallest currency unit (paise for INR), matching how
 *   Payment.amount is stored — formatted to a display value here.
 */
const sendSubscriptionSuccessEmail = async ({ to, name, planName, billingCycle, amount, currency, periodEnd }) => {
  const formattedAmount =
    currency === 'INR' ? `₹${(amount / 100).toFixed(2)}` : `${currency} ${(amount / 100).toFixed(2)}`;
  const formattedPeriodEnd = new Date(periodEnd).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  await sendEmail({
    to,
    subject: 'Subscription confirmed — CrewApply',
    html: subscriptionSuccessEmail({ name, planName, billingCycle, formattedAmount, formattedPeriodEnd }),
  });
};

/**
 * Sends the consultancy-booking-received email immediately once payment
 * succeeds, before an admin has confirmed/rejected it (that later step sends
 * sendConsultancyBookingStatusEmail instead).
 *
 * @param {{ to: string, name: string, topic: string, slotDate: Date, slotTime: string }} params
 */
const sendConsultancyBookingReceivedEmail = async ({ to, name, topic, slotDate, slotTime }) => {
  const formattedDate = new Date(slotDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const formattedSlot = `${formattedDate} at ${slotTime}`;

  await sendEmail({
    to,
    subject: 'Booking received — CrewApply Consultancy',
    html: consultancyBookingReceivedEmail({ name, topic, formattedSlot }),
  });
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetOtpEmail,
  sendApplicationStatusEmail,
  sendOtpEmail,
  sendAdminInviteEmail,
  sendJobAlertEmail,
  sendConsultancyBookingStatusEmail,
  sendSubscriptionSuccessEmail,
  sendConsultancyBookingReceivedEmail,
};
