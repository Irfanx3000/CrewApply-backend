'use strict';

/**
 * Central API endpoint registry.
 *
 * Every route in the application must be listed here.
 * Add new endpoints here first, then reference them in routes and services.
 * Never hardcode paths outside of this file.
 */

const API_PREFIX = '/api/v1';

// ── Auth ──────────────────────────────────────────────────────────────────────

const AUTH_ENDPOINTS = Object.freeze({
  BASE: `${API_PREFIX}/auth`,

  // Registration & mobile OTP
  REGISTER:             `${API_PREFIX}/auth/register`,
  SEND_OTP:             `${API_PREFIX}/auth/send-otp`,
  VERIFY_MOBILE:        `${API_PREFIX}/auth/verify-mobile`,

  // Email verification (secondary)
  VERIFY_EMAIL:         `${API_PREFIX}/auth/verify-email/:token`,
  RESEND_VERIFICATION:  `${API_PREFIX}/auth/resend-verification`,

  // Login & token management
  LOGIN:                `${API_PREFIX}/auth/login`,
  REFRESH_TOKEN:        `${API_PREFIX}/auth/refresh`,

  // Logout
  LOGOUT:               `${API_PREFIX}/auth/logout`,
  LOGOUT_ALL:           `${API_PREFIX}/auth/logout-all`,

  // Password flows
  FORGOT_PASSWORD:      `${API_PREFIX}/auth/forgot-password`,
  RESET_PASSWORD:       `${API_PREFIX}/auth/reset-password/:token`,
  CHANGE_PASSWORD:      `${API_PREFIX}/auth/change-password`,

  // OAuth
  GOOGLE:               `${API_PREFIX}/auth/google`,
});

// ── User ──────────────────────────────────────────────────────────────────────

const USER_ENDPOINTS = Object.freeze({
  BASE: `${API_PREFIX}/user`,

  // Profile
  PROFILE:              `${API_PREFIX}/user/profile`,
  PROFILE_PHOTO:        `${API_PREFIX}/user/profile-photo`,
  MARITIME_PROFILE:     `${API_PREFIX}/user/maritime-profile`,

  // Resume
  RESUME:               `${API_PREFIX}/user/resume`,

  // Certificates & STCW
  CERTIFICATES:         `${API_PREFIX}/user/certificates`,
  CERTIFICATE_BY_ID:    `${API_PREFIX}/user/certificates/:id`,

  // Passport
  PASSPORT:             `${API_PREFIX}/user/passport`,

  // CDC (Continuous Discharge Certificate)
  CDC:                  `${API_PREFIX}/user/cdc`,

  // Medical certificate
  MEDICAL:              `${API_PREFIX}/user/medical`,

  // Visa
  VISA:                 `${API_PREFIX}/user/visa`,
  VISA_BY_ID:           `${API_PREFIX}/user/visa/:id`,

  // All documents grouped by category
  DOCUMENTS:            `${API_PREFIX}/user/documents`,

  // Admin demo
  ADMIN_ONLY:           `${API_PREFIX}/user/admin-only`,
});

// ── Admin ──────────────────────────────────────────────────────────────────────
// Placeholder — Phase 9

const ADMIN_ENDPOINTS = Object.freeze({
  BASE:       `${API_PREFIX}/admin`,
  DASHBOARD:  `${API_PREFIX}/admin/dashboard`,
  USERS:      `${API_PREFIX}/admin/users`,
  USER_BY_ID: `${API_PREFIX}/admin/users/:id`,
  JOBS:       `${API_PREFIX}/admin/jobs`,
});

// ── Companies ─────────────────────────────────────────────────────────────────
// Placeholder — Phase 4

const COMPANY_ENDPOINTS = Object.freeze({
  BASE:         `${API_PREFIX}/companies`,
  BY_ID:        `${API_PREFIX}/companies/:id`,
  JOBS:         `${API_PREFIX}/companies/:id/jobs`,
});

// ── Jobs ──────────────────────────────────────────────────────────────────────
// Placeholder — Phase 4

const JOB_ENDPOINTS = Object.freeze({
  BASE:         `${API_PREFIX}/jobs`,
  BY_ID:        `${API_PREFIX}/jobs/:id`,
  SAVE:         `${API_PREFIX}/jobs/:id/save`,
  UNSAVE:       `${API_PREFIX}/jobs/:id/unsave`,
  SAVED:        `${API_PREFIX}/jobs/saved`,
});

// ── Applications ──────────────────────────────────────────────────────────────

const APPLICATION_ENDPOINTS = Object.freeze({
  BASE:         `${API_PREFIX}/applications`,
  BY_ID:        `${API_PREFIX}/applications/:id`,
  ELIGIBILITY:  `${API_PREFIX}/applications/eligibility/:jobId`,
  WITHDRAW:     `${API_PREFIX}/applications/:id/withdraw`,
  STATUS:       `${API_PREFIX}/applications/:id/status`, // still unimplemented — admin review, out of scope for now
});

// ── Notifications ─────────────────────────────────────────────────────────────
// Placeholder — Phase 8

const NOTIFICATION_ENDPOINTS = Object.freeze({
  BASE:         `${API_PREFIX}/notifications`,
  BY_ID:        `${API_PREFIX}/notifications/:id`,
  MARK_READ:    `${API_PREFIX}/notifications/:id/read`,
  MARK_ALL:     `${API_PREFIX}/notifications/read-all`,
});

module.exports = {
  API_PREFIX,
  AUTH_ENDPOINTS,
  USER_ENDPOINTS,
  ADMIN_ENDPOINTS,
  COMPANY_ENDPOINTS,
  JOB_ENDPOINTS,
  APPLICATION_ENDPOINTS,
  NOTIFICATION_ENDPOINTS,
};
