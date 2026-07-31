'use strict';

const { renderEmailLayout, COLORS } = require('../emailLayout');

/**
 * Generates the HTML body for an OTP verification email — the code is shown
 * large and prominent so it's easy to read and re-type.
 *
 * @param {{ name: string, otp: string }} params
 * @returns {string} HTML string.
 */
const otpEmail = ({ name, otp }) =>
  renderEmailLayout({
    title: 'Your Verification Code — CrewApply',
    centered: true,
    bodyHtml: `
      <h2 style="margin:0 0 16px;color:${COLORS.textHeading};font-size:20px;font-weight:600;">Verify your account</h2>
      <p style="margin:0 0 24px;color:${COLORS.textBody};font-size:15px;line-height:1.6;">Hi ${name}, use this code to verify your account:</p>
      <div style="margin:0 0 24px;padding:20px;background:${COLORS.pageBg};border-radius:8px;">
        <span style="font-size:36px;font-weight:700;letter-spacing:10px;color:${COLORS.primary};">${otp}</span>
      </div>
      <p style="margin:0;color:${COLORS.textMuted};font-size:13px;line-height:1.6;">
        This code expires in <strong>10 minutes</strong>. If you did not request this, you can safely ignore this email.
      </p>
    `,
  });

module.exports = otpEmail;
