'use strict';

const { renderEmailLayout, COLORS } = require('../emailLayout');

/**
 * Generates the HTML body for a job-alert email (Premium/Elite subscribers,
 * sent when a newly posted job matches their plan).
 *
 * @param {{ title: string, companyName: string, rank: string, department: string, location: string|null }} params
 * @returns {string} HTML string.
 */
const jobAlertEmail = ({ title, companyName, rank, department, location }) =>
  renderEmailLayout({
    title: `New job matching your plan: ${title}`,
    bodyHtml: `
      <h2 style="margin:0 0 8px;color:${COLORS.textHeading};font-size:20px;font-weight:600;">New job posted for you</h2>
      <p style="margin:0 0 24px;color:${COLORS.textBody};font-size:15px;line-height:1.6;">This job matches your CrewApply subscription plan.</p>
      <div style="margin:0 0 24px;border:1px solid ${COLORS.border};border-radius:8px;padding:20px;">
        <p style="margin:0 0 4px;color:${COLORS.textHeading};font-size:16px;font-weight:700;">${title}</p>
        <p style="margin:0 0 4px;color:${COLORS.textBody};font-size:14px;">${companyName}</p>
        <p style="margin:0;color:${COLORS.textBody};font-size:14px;">${rank} &mdash; ${department}${location ? ` &middot; ${location}` : ''}</p>
      </div>
      <p style="margin:0;color:${COLORS.textBody};font-size:15px;line-height:1.6;">Open the CrewApply app to view full details and apply.</p>
    `,
  });

module.exports = jobAlertEmail;
