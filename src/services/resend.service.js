'use strict';

const { config } = require('../config');

const RESEND_API_URL = 'https://api.resend.com/emails';

// Optional integration, same contract as push.service.js: lazily reads
// config.resend.apiKey, never throws, and silently no-ops until an admin
// sets RESEND_API_KEY — the app boots and job alerts still work (app/push
// only) with zero email configuration.
const isConfigured = () => !!config.resend.apiKey;

/**
 * Sends one email via the Resend API. Never throws — email is a best-effort
 * enhancement layered on top of the in-app notification + push send (the
 * notification of record), never the only way a user finds out about a job.
 */
const send = async ({ to, subject, html }) => {
  if (!isConfigured()) return;

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resend.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.resend.fromEmail,
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('ResendService: send failed:', response.status, body);
    }
  } catch (err) {
    console.error('ResendService: send failed:', err.message);
  }
};

// job is the raw Job document (not presentJob()'d) — see
// notification.service.js#notifyEligibleUsersForJob, its only caller.
const sendJobAlertEmail = (to, job) => {
  const location = job.location?.country
    ? `${job.location.city ? `${job.location.city}, ` : ''}${job.location.country}`
    : null;

  const subject = `New job matching your plan: ${job.title}`;
  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #1E1E1E;">
      <h2 style="color: #0D3E85; margin-bottom: 4px;">New job posted for you</h2>
      <p style="margin: 0 0 16px; color: #556172;">This job matches your CrewApply subscription plan.</p>
      <div style="border: 1px solid #E4E9F0; border-radius: 12px; padding: 16px;">
        <p style="margin: 0 0 4px; font-size: 16px; font-weight: bold;">${job.title}</p>
        <p style="margin: 0 0 4px; color: #556172;">${job.companyName}</p>
        <p style="margin: 0; color: #556172;">${job.rank} &mdash; ${job.department}${location ? ` &middot; ${location}` : ''}</p>
      </div>
      <p style="margin-top: 20px; color: #556172;">Open the CrewApply app to view full details and apply.</p>
    </div>
  `;

  return send({ to, subject, html });
};

module.exports = { isConfigured, send, sendJobAlertEmail };
