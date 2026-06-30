'use strict';

const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

/**
 * Role-based access control middleware.
 *
 * Must be used after `authenticate` middleware — relies on `req.user` being set.
 *
 * Usage:
 *   router.get('/admin/dashboard', authenticate, authorize('admin'), handler);
 *   router.get('/resource', authenticate, authorize('admin', 'moderator'), handler);
 *
 * Designed to be open-closed: adding new roles to the system never requires
 * changes to this middleware — just pass the new role name to authorize().
 *
 * @param {...string} roles - One or more roles that are permitted to access the route.
 * @returns {import('express').RequestHandler}
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError(AUTH_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED, 'UNAUTHORIZED'));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError(AUTH_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN, 'FORBIDDEN'));
    }

    next();
  };
};

module.exports = authorize;
