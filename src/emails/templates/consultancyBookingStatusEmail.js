'use strict';

const { renderEmailLayout, COLORS } = require('../emailLayout');

/**
 * Generates the HTML body for a consultancy booking confirmed/rejected
 * email — sent when an admin resolves an "awaiting_confirmation" booking.
 *
 * @param {{ name: string, isConfirmed: boolean, note?: string, topicLabel?: string, formattedSlot?: string }} params
 * @returns {string} HTML string.
 */
const consultancyBookingStatusEmail = ({ name, isConfirmed, note, topicLabel, formattedSlot }) => {
  const title = isConfirmed
    ? 'Your CrewApply consultancy session is confirmed'
    : 'Update on your CrewApply consultancy booking';

  // Same details-box pattern as consultancyBookingReceivedEmail.js, shown
  // for both outcomes — useful context either way (what topic/time this was
  // actually about), not just on confirmation.
  const detailsHtml = topicLabel && formattedSlot
    ? `
      <div style="margin:0 0 24px;border:1px solid ${COLORS.border};border-radius:8px;padding:20px;">
        <p style="margin:0 0 8px;color:${COLORS.textHeading};font-size:14px;">Topic: <strong>${topicLabel}</strong></p>
        <p style="margin:0;color:${COLORS.textHeading};font-size:14px;">Session: <strong>${formattedSlot}</strong></p>
      </div>
    `
    : '';

  return renderEmailLayout({
    title,
    bodyHtml: `
      <h2 style="margin:0 0 16px;color:${COLORS.textHeading};font-size:20px;font-weight:600;">${title}</h2>
      <p style="margin:0 0 16px;color:${COLORS.textBody};font-size:15px;line-height:1.6;">Hi ${name},</p>
      ${detailsHtml}
      ${note ? `<p style="margin:0;color:${COLORS.textBody};font-size:15px;line-height:1.6;">${note.replace(/\n/g, '<br/>')}</p>` : ''}
    `,
  });
};

module.exports = consultancyBookingStatusEmail;
