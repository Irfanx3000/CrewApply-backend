'use strict';

const nodemailer = require('nodemailer');
const { config } = require('../config');
const verificationEmail = require('../emails/templates/verificationEmail');
const resetPasswordEmail = require('../emails/templates/resetPasswordEmail');
const applicationStatusEmail = require('../emails/templates/applicationStatusEmail');
const otpEmail = require('../emails/templates/otpEmail');
const adminInviteEmail = require('../emails/templates/adminInviteEmail');
const { STATUS_NOTIFICATION_COPY } = require('../constants/applicationStatusCopy');

let _transporter = null;

/**
 * Returns a lazily-initialised nodemailer transporter.
 *
 * In development (no EMAIL_HOST configured) the service logs emails to the
 * console instead of sending them, avoiding the need for real SMTP credentials.
 *
 * @returns {Promise<import('nodemailer').Transporter>}
 */
const getTransporter = async () => {
  if (_transporter) return _transporter;

  if (!config.email.host) {
    // Development fallback — create a disposable Ethereal account and log the preview URL.
    const testAccount = await nodemailer.createTestAccount();

    _transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });

    return _transporter;
  }

  _transporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.port === 465,
    auth: { user: config.email.user, pass: config.email.pass },
  });

  return _transporter;
};

/**
 * Core send function shared by all email helpers.
 *
 * @param {{ to: string, subject: string, html: string }} options
 * @returns {Promise<void>}
 */
const sendEmail = async ({ to, subject, html }) => {
  const transporter = await getTransporter();

  const info = await transporter.sendMail({
    from: config.email.from,
    to,
    subject,
    html,
  });

  if (!config.email.host && config.isDevelopment) {
    console.log('\n📧 Email preview URL:', nodemailer.getTestMessageUrl(info));
  }
};

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
 * Sends the password reset email.
 *
 * @param {{ to: string, name: string, token: string }} params
 */
const sendPasswordResetEmail = async ({ to, name, token }) => {
  const resetUrl = `${config.client.url}/reset-password/${token}`;

  await sendEmail({
    to,
    subject: 'Reset your password — CrewApply',
    html: resetPasswordEmail({ name, resetUrl }),
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

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendApplicationStatusEmail,
  sendOtpEmail,
  sendAdminInviteEmail,
};
