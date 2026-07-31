'use strict';

const { renderEmailLayout, renderButton, COLORS } = require('../emailLayout');

/**
 * Generates the HTML body for the email verification email.
 *
 * @param {{ name: string, verificationUrl: string }} params
 * @returns {string} HTML string.
 */
const verificationEmail = ({ name, verificationUrl }) =>
  renderEmailLayout({
    title: 'Verify Your Email — CrewApply',
    bodyHtml: `
      <h2 style="margin:0 0 16px;color:${COLORS.textHeading};font-size:20px;font-weight:600;">Verify your email address</h2>
      <p style="margin:0 0 16px;color:${COLORS.textBody};font-size:15px;line-height:1.6;">Hi ${name},</p>
      <p style="margin:0 0 24px;color:${COLORS.textBody};font-size:15px;line-height:1.6;">
        Thanks for signing up. Please verify your email address to activate your account.
        This link expires in <strong>24 hours</strong>.
      </p>
      ${renderButton({ href: verificationUrl, label: 'Verify Email Address' })}
      <p style="margin:0 0 8px;color:${COLORS.textMuted};font-size:13px;">Or paste this link into your browser:</p>
      <p style="margin:0 0 24px;color:${COLORS.textBody};font-size:13px;word-break:break-all;">${verificationUrl}</p>
      <p style="margin:0;color:${COLORS.textMuted};font-size:13px;line-height:1.6;">
        If you did not create an account, you can safely ignore this email.
      </p>
    `,
  });

module.exports = verificationEmail;
