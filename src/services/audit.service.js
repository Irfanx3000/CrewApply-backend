'use strict';

const AuditLog = require('../models/auditLog.model');

/**
 * Records a security event in the audit log.
 *
 * This function never throws — audit failures must not interrupt the
 * main request flow. Failures are silently logged to stderr.
 *
 * @param {object} params
 * @param {string}  params.event     - One of AUDIT_EVENTS values.
 * @param {string}  [params.userId]  - The user this event belongs to.
 * @param {string}  [params.ipAddress]
 * @param {string}  [params.userAgent]
 * @param {object}  [params.metadata] - Extra event-specific context.
 * @returns {Promise<void>}
 */
const log = async ({ event, userId = null, ipAddress = null, userAgent = null, metadata = null }) => {
  try {
    await AuditLog.create({ event, userId, ipAddress, userAgent, metadata });
  } catch (err) {
    console.error('AuditService: failed to write audit log:', err.message);
  }
};

/**
 * Returns the most recent audit events for a given user.
 *
 * @param {string} userId
 * @param {number} [limit=20]
 * @returns {Promise<import('../models/auditLog.model')[]}
 */
const getRecentActivity = async (userId, limit = 20) => {
  return AuditLog.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

module.exports = { log, getRecentActivity };
