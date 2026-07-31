'use strict';

const { config } = require('../config');

// A real hosted URL, not a base64 data URI — Gmail (web/Chrome) blocks
// base64-embedded <img> tags in HTML emails, so the logo showed as a broken
// image there even though the rest of the email rendered fine. Served by
// this API itself (see app.js's /email-assets static route) at
// src/emails/assets/logo.png (120x120, ~9.7KB). Requires config.publicUrl to
// be a real reachable URL in production (https://api.crewapply.com) — see
// .env.example's PUBLIC_URL.
const LOGO_SRC = `${config.publicUrl}/email-assets/logo.png`;

// Brand tokens — mirrors the mobile app's canonical palette
// (CrewApply/src/theme/colors.js), so transactional email reads as the same
// product as the app instead of a generic, unbranded blue.
const COLORS = {
  primary: '#056DEC',
  primaryDark: '#1962BA',
  headerStart: '#2252A3',
  headerEnd: '#0E2D63',
  headerSolid: '#0D3E85',
  danger: '#EC0509',
  textHeading: '#1E1E1E',
  textBody: '#556172',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  pageBg: '#F4F6F6',
};

/**
 * A branded CTA button — email-safe (solid bgcolor fallback for Outlook,
 * which ignores border-radius/gradients but always respects a plain
 * background color on a table cell).
 *
 * @param {{ href: string, label: string, background?: string }} params
 * @returns {string} HTML string.
 */
const renderButton = ({ href, label, background = COLORS.primary }) => `
  <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
    <tr>
      <td bgcolor="${background}" style="background:${background};border-radius:8px;">
        <a href="${href}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
          ${label}
        </a>
      </td>
    </tr>
  </table>
`;

/**
 * Shared branded wrapper every transactional email renders its content
 * through — one place for the outer table/header/footer markup instead of
 * every template file re-declaring the same boilerplate.
 *
 * @param {{ title: string, headerText?: string, bodyHtml: string, centered?: boolean }} params
 * @returns {string} Full HTML document string.
 */
const renderEmailLayout = ({ title, headerText = 'CrewApply', bodyHtml, centered = false }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.pageBg};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.pageBg};padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(13,62,133,0.14);">
          <!-- Header -->
          <tr>
            <td
              bgcolor="${COLORS.headerSolid}"
              style="background:${COLORS.headerSolid};background-image:linear-gradient(135deg, ${COLORS.headerStart}, ${COLORS.headerEnd});padding:36px 40px;text-align:center;"
            >
              <img
                src="${LOGO_SRC}"
                width="56"
                height="56"
                alt="CrewApply"
                style="display:block;width:56px;height:56px;margin:0 auto 14px;border-radius:14px;"
              />
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">${headerText}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;${centered ? 'text-align:center;' : ''}">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:24px 40px;border-top:1px solid ${COLORS.border};text-align:center;">
              <p style="margin:0 0 4px;color:${COLORS.textBody};font-size:12px;font-weight:600;">CrewApply</p>
              <p style="margin:0;color:${COLORS.textMuted};font-size:12px;">© ${new Date().getFullYear()} CrewApply. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

module.exports = { renderEmailLayout, renderButton, COLORS };
