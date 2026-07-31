'use strict';

const { config } = require('../config');

const RESEND_API_URL = 'https://api.resend.com/emails';

// The one shared transport every outbound email in the app goes through —
// domain-specific "what email, for what reason" logic lives in
// email.service.js, not here. Lazily reads config.resend.apiKey, never
// throws, and silently no-ops until an admin sets RESEND_API_KEY — the app
// boots and every other feature keeps working with zero email configuration.
const isConfigured = () => !!config.resend.apiKey;

/**
 * Sends one email via the Resend API. Never throws — callers fire-and-forget
 * this (`.catch(() => {})` or equivalent) rather than let an email failure
 * break the user-facing action that triggered it.
 *
 * @param {{ to: string, subject: string, html: string, from?: string }} params
 *   `from` defaults to config.resend.fromEmail (the alerts@ address) —
 *   pass an explicit `from` for anything that should read as transactional
 *   rather than an alert (see email.service.js, which passes config.email.from).
 */
const send = async ({ to, subject, html, from = config.resend.fromEmail }) => {
  if (!isConfigured()) return;

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resend.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
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

module.exports = { isConfigured, send };
