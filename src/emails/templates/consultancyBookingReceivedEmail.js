'use strict';

const { renderEmailLayout, COLORS } = require('../emailLayout');

/**
 * Generates the HTML body for a consultancy-booking-received email — sent
 * immediately once payment succeeds, before an admin confirms/rejects it
 * (that later step sends its own email, see consultancyBookingStatusEmail).
 *
 * @param {{ name: string, topic: string, formattedSlot: string }} params
 * @returns {string} HTML string.
 */
const consultancyBookingReceivedEmail = ({ name, topic, formattedSlot }) =>
  renderEmailLayout({
    title: 'Booking received — CrewApply Consultancy',
    bodyHtml: `
      <h2 style="margin:0 0 16px;color:${COLORS.textHeading};font-size:20px;font-weight:600;">We've received your booking request</h2>
      <p style="margin:0 0 16px;color:${COLORS.textBody};font-size:15px;line-height:1.6;">Hi ${name},</p>
      <p style="margin:0 0 24px;color:${COLORS.textBody};font-size:15px;line-height:1.6;">
        Your consultancy session request has been received and is awaiting confirmation.
      </p>
      <div style="margin:0 0 24px;border:1px solid ${COLORS.border};border-radius:8px;padding:20px;">
        <p style="margin:0 0 8px;color:${COLORS.textHeading};font-size:14px;">Topic: <strong>${topic}</strong></p>
        <p style="margin:0;color:${COLORS.textHeading};font-size:14px;">Requested slot: <strong>${formattedSlot}</strong></p>
      </div>
      <p style="margin:0;color:${COLORS.textBody};font-size:15px;line-height:1.6;">
        We'll email you again as soon as it's confirmed.
      </p>
    `,
  });

module.exports = consultancyBookingReceivedEmail;
