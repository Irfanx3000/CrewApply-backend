'use strict';

/**
 * Generates the HTML body for an admin-invite email — distinct copy from the
 * consumer otpEmail template (this recipient is being invited to administer
 * the platform, not verifying their own signup), sharing only the visual style.
 *
 * @param {{ otp: string, acceptUrl: string }} params
 * @returns {string} HTML string.
 */
const adminInviteEmail = ({ otp, acceptUrl }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You've been invited to CrewApply Admin</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#1a56db;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">CrewApply Admin</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;text-align:center;">
              <h2 style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:600;">You've been invited to administer CrewApply</h2>
              <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">
                An existing administrator has invited you to the CrewApply Admin dashboard.
                Use this code to verify your email and set up your password:
              </p>
              <div style="margin:0 0 24px;padding:20px;background:#f4f5f7;border-radius:8px;">
                <span style="font-size:36px;font-weight:700;letter-spacing:10px;color:#1a56db;">${otp}</span>
              </div>
              <p style="margin:0 0 24px;">
                <a href="${acceptUrl}" style="display:inline-block;padding:12px 28px;background:#1a56db;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
                  Accept Invite &amp; Set Up Account
                </a>
              </p>
              <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">
                This code expires in <strong>10 minutes</strong>. If you weren't expecting this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} CrewApply. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

module.exports = adminInviteEmail;
