'use strict';

const { renderEmailLayout, COLORS } = require('../emailLayout');

/**
 * Generates the HTML body for a consultancy booking confirmed/rejected
 * email — sent when an admin resolves an "awaiting_confirmation" booking.
 *
 * @param {{ name: string, isConfirmed: boolean, note?: string }} params
 * @returns {string} HTML string.
 */
const consultancyBookingStatusEmail = ({ name, isConfirmed, note }) => {
  const title = isConfirmed
    ? 'Your CrewApply consultancy session is confirmed'
    : 'Update on your CrewApply consultancy booking';

  return renderEmailLayout({
    title,
    bodyHtml: `
      <h2 style="margin:0 0 16px;color:${COLORS.textHeading};font-size:20px;font-weight:600;">${title}</h2>
      <p style="margin:0 0 16px;color:${COLORS.textBody};font-size:15px;line-height:1.6;">Hi ${name},</p>
      ${note ? `<p style="margin:0;color:${COLORS.textBody};font-size:15px;line-height:1.6;">${note.replace(/\n/g, '<br/>')}</p>` : ''}
    `,
  });
};

module.exports = consultancyBookingStatusEmail;
