'use strict';

const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const jobRoutes = require('./job.routes');
const adminJobRoutes = require('./adminJob.routes');
const applicationRoutes = require('./application.routes');
const subscriptionRoutes = require('./subscription.routes');
const paymentRoutes = require('./payment.routes');
const adminPlanRoutes = require('./adminPlan.routes');
const documentTypeRoutes = require('./documentType.routes');
const adminDocumentTypeRoutes = require('./adminDocumentType.routes');
const { API_PREFIX } = require('../constants/api.endpoints');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

/**
 * Mounts all versioned API routes onto the Express app.
 *
 * To add a new feature router:
 *   1. Create src/routes/<feature>.routes.js
 *   2. Import it here and add one app.use() line.
 *   No other file needs to change.
 *
 * @param {import('express').Application} app
 */
const setupRoutes = (app) => {
  app.use(`${API_PREFIX}/auth`, authRoutes);
  app.use(`${API_PREFIX}/user`, userRoutes);
  app.use(`${API_PREFIX}/admin/jobs`, adminJobRoutes);
  app.use(`${API_PREFIX}/jobs`, jobRoutes);
  app.use(`${API_PREFIX}/applications`, applicationRoutes);
  app.use(`${API_PREFIX}/subscription`, subscriptionRoutes);
  app.use(`${API_PREFIX}/payments`, paymentRoutes);
  app.use(`${API_PREFIX}/admin/plans`, adminPlanRoutes);
  app.use(`${API_PREFIX}/admin/document-types`, adminDocumentTypeRoutes);
  app.use(`${API_PREFIX}/document-types`, documentTypeRoutes);

  // 404 handler — must be registered after all valid routes.
  app.use((req, res, next) => {
    next(new AppError(AUTH_MESSAGES.NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND'));
  });
};

module.exports = setupRoutes;
