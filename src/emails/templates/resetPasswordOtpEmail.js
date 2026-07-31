'use strict';

const { renderEmailLayout, COLORS } = require('../emailLayout');

/**
 * Generates the HTML body for a password-reset OTP email — same visual
 * pattern as otpEmail.js (large, prominent code), distinct subject/copy
 * since this is a security-sensitive action, not account verification.
 *
 * @param {{ name: string, otp: string }} params
 * @returns {string} HTML string.
 */
const resetPasswordOtpEmail = ({ name, otp }) =>
  renderEmailLayout({
    title: 'Reset Your Password — CrewApply',
    centered: true,
    bodyHtml: `
      <h2 style="margin:0 0 16px;color:${COLORS.textHeading};font-size:20px;font-weight:600;">Reset your password</h2>
      <p style="margin:0 0 24px;color:${COLORS.textBody};font-size:15px;line-height:1.6;">Hi ${name}, use this code to reset your password:</p>
      <div style="margin:0 0 24px;padding:20px;background:${COLORS.pageBg};border-radius:8px;">
        <span style="font-size:36px;font-weight:700;letter-spacing:10px;color:${COLORS.primary};">${otp}</span>
      </div>
      <p style="margin:0;color:${COLORS.textMuted};font-size:13px;line-height:1.6;">
        This code expires in <strong>10 minutes</strong>. If you did not request a password reset, you can safely ignore this email — your password will not change.
      </p>
    `,
  });

module.exports = resetPasswordOtpEmail;
