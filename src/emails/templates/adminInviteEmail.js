'use strict';

const { renderEmailLayout, renderButton, COLORS } = require('../emailLayout');

/**
 * Generates the HTML body for an admin-invite email — distinct copy from the
 * consumer otpEmail template (this recipient is being invited to administer
 * the platform, not verifying their own signup), sharing only the visual style.
 *
 * @param {{ otp: string, acceptUrl: string }} params
 * @returns {string} HTML string.
 */
const adminInviteEmail = ({ otp, acceptUrl }) =>
  renderEmailLayout({
    title: "You've been invited to CrewApply Admin",
    headerText: 'CrewApply Admin',
    centered: true,
    bodyHtml: `
      <h2 style="margin:0 0 16px;color:${COLORS.textHeading};font-size:20px;font-weight:600;">You've been invited to administer CrewApply</h2>
      <p style="margin:0 0 24px;color:${COLORS.textBody};font-size:15px;line-height:1.6;">
        An existing administrator has invited you to the CrewApply Admin dashboard.
        Use this code to verify your email and set up your password:
      </p>
      <div style="margin:0 0 24px;padding:20px;background:${COLORS.pageBg};border-radius:8px;">
        <span style="font-size:36px;font-weight:700;letter-spacing:10px;color:${COLORS.primary};">${otp}</span>
      </div>
      ${renderButton({ href: acceptUrl, label: 'Accept Invite &amp; Set Up Account' })}
      <p style="margin:0;color:${COLORS.textMuted};font-size:13px;line-height:1.6;">
        This code expires in <strong>10 minutes</strong>. If you weren't expecting this invitation, you can safely ignore this email.
      </p>
    `,
  });

module.exports = adminInviteEmail;
