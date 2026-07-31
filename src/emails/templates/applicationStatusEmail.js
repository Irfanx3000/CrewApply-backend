'use strict';

const { renderEmailLayout, COLORS } = require('../emailLayout');

/**
 * Generates the HTML body for an application-status-change email. Shared by
 * all 4 statuses (under_review/interview_scheduled/selected/rejected) — only
 * the title/message text differs, so this stays a single template.
 *
 * @param {{ name: string, title: string, message: string }} params
 * @returns {string} HTML string.
 */
const applicationStatusEmail = ({ name, title, message }) =>
  renderEmailLayout({
    title: `${title} — CrewApply`,
    bodyHtml: `
      <h2 style="margin:0 0 16px;color:${COLORS.textHeading};font-size:20px;font-weight:600;">${title}</h2>
      <p style="margin:0 0 16px;color:${COLORS.textBody};font-size:15px;line-height:1.6;">Hi ${name},</p>
      <p style="margin:0;color:${COLORS.textBody};font-size:15px;line-height:1.6;">${message}</p>
    `,
  });

module.exports = applicationStatusEmail;
