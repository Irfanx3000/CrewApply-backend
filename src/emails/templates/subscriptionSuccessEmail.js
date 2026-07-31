'use strict';

const { renderEmailLayout, COLORS } = require('../emailLayout');

/**
 * Generates the HTML body for a subscription-purchase-confirmation email —
 * sent once a payment successfully activates a subscription.
 *
 * @param {{ name: string, planName: string, billingCycle: string, formattedAmount: string, formattedPeriodEnd: string }} params
 * @returns {string} HTML string.
 */
const subscriptionSuccessEmail = ({ name, planName, billingCycle, formattedAmount, formattedPeriodEnd }) =>
  renderEmailLayout({
    title: 'Subscription confirmed — CrewApply',
    bodyHtml: `
      <h2 style="margin:0 0 16px;color:${COLORS.textHeading};font-size:20px;font-weight:600;">You're all set!</h2>
      <p style="margin:0 0 16px;color:${COLORS.textBody};font-size:15px;line-height:1.6;">Hi ${name},</p>
      <p style="margin:0 0 24px;color:${COLORS.textBody};font-size:15px;line-height:1.6;">
        Your <strong>${planName}</strong> subscription is now active. Here's a summary of your purchase:
      </p>
      <div style="margin:0 0 24px;border:1px solid ${COLORS.border};border-radius:8px;padding:20px;">
        <p style="margin:0 0 8px;color:${COLORS.textHeading};font-size:14px;">Plan: <strong>${planName}</strong></p>
        <p style="margin:0 0 8px;color:${COLORS.textHeading};font-size:14px;">Billing cycle: <strong>${billingCycle}</strong></p>
        <p style="margin:0 0 8px;color:${COLORS.textHeading};font-size:14px;">Amount paid: <strong>${formattedAmount}</strong></p>
        <p style="margin:0;color:${COLORS.textHeading};font-size:14px;">Renews on: <strong>${formattedPeriodEnd}</strong></p>
      </div>
      <p style="margin:0;color:${COLORS.textBody};font-size:15px;line-height:1.6;">
        Thanks for subscribing to CrewApply — open the app to explore your plan's full benefits.
      </p>
    `,
  });

module.exports = subscriptionSuccessEmail;
