'use strict';

const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

/**
 * Fine-grained, per-section read/write gate — layered AFTER `authenticate` +
 * `authorize(ROLES.ADMIN)`, which only confirm "this is some kind of admin."
 *
 * Infers the required access level from the HTTP method (GET/HEAD = read,
 * everything else = write), so a single `router.use(requireSection('jobs'))`
 * per route file covers every route in it — no per-route annotation needed.
 *
 * `req.user.permissions` absent = full access (grandfathers every admin that
 * predates this feature, and any invite that didn't use the scope picker) —
 * see user.model.js's `permissions` field comment.
 *
 * @param {string} section - one of user.model.js's permissionsSchema keys.
 * @returns {import('express').RequestHandler}
 */
const requireSection = (section) => (req, res, next) => {
  const perms = req.user.permissions;
  if (!perms) return next();

  const level = ['GET', 'HEAD'].includes(req.method) ? 'read' : 'write';
  if (!perms[section]?.[level]) {
    return next(new AppError(AUTH_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN, 'FORBIDDEN'));
  }

  next();
};

module.exports = requireSection;
