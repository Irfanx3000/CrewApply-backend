'use strict';

const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const jobRoutes = require('./job.routes');
const adminJobRoutes = require('./adminJob.routes');
const savedJobRoutes = require('./savedJob.routes');
const jobAlertRoutes = require('./jobAlert.routes');
const applicationRoutes = require('./application.routes');
const adminApplicationRoutes = require('./adminApplication.routes');
const adminUserRoutes = require('./adminUser.routes');
const adminAccountRoutes = require('./adminAccount.routes');
const adminReferralRoutes = require('./adminReferral.routes');
const subscriptionRoutes = require('./subscription.routes');
const paymentRoutes = require('./payment.routes');
const adminPlanRoutes = require('./adminPlan.routes');
const adminSubscriptionRoutes = require('./adminSubscription.routes');
const adminPaymentRoutes = require('./adminPayment.routes');
const adminDashboardRoutes = require('./adminDashboard.routes');
const documentTypeRoutes = require('./documentType.routes');
const adminDocumentTypeRoutes = require('./adminDocumentType.routes');
const jobTaxonomyRoutes = require('./jobTaxonomy.routes');
const adminJobTaxonomyRoutes = require('./adminJobTaxonomy.routes');
const careerProfileRoutes = require('./careerProfile.routes');
const resumeConfigurationRoutes = require('./resumeConfiguration.routes');
const resumeTemplateRoutes = require('./resumeTemplate.routes');
const adminResumeTemplateRoutes = require('./adminResumeTemplate.routes');
const adminDocumentRoutes = require('./adminDocument.routes');
const notificationRoutes = require('./notification.routes');
const bannerRoutes = require('./banner.routes');
const adminBannerRoutes = require('./adminBanner.routes');
const searchRoutes = require('./search.routes');
const adminSearchRoutes = require('./adminSearch.routes');
const consultancyRoutes = require('./consultancy.routes');
const adminConsultancyRoutes = require('./adminConsultancy.routes');
const walletRoutes = require('./wallet.routes');
const supportInquiryRoutes = require('./supportInquiry.routes');
const adminSupportInquiryRoutes = require('./adminSupportInquiry.routes');
const geoRoutes = require('./geo.routes');
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
  app.use(`${API_PREFIX}/saved-jobs`, savedJobRoutes);
  app.use(`${API_PREFIX}/job-alerts`, jobAlertRoutes);
  app.use(`${API_PREFIX}/admin/applications`, adminApplicationRoutes);
  app.use(`${API_PREFIX}/admin/users`, adminUserRoutes);
  app.use(`${API_PREFIX}/admin/admin-accounts`, adminAccountRoutes);
  app.use(`${API_PREFIX}/admin/referrals`, adminReferralRoutes);
  app.use(`${API_PREFIX}/applications`, applicationRoutes);
  app.use(`${API_PREFIX}/subscription`, subscriptionRoutes);
  app.use(`${API_PREFIX}/payments`, paymentRoutes);
  app.use(`${API_PREFIX}/admin/plans`, adminPlanRoutes);
  app.use(`${API_PREFIX}/admin/subscriptions`, adminSubscriptionRoutes);
  app.use(`${API_PREFIX}/admin/payments`, adminPaymentRoutes);
  app.use(`${API_PREFIX}/admin/dashboard`, adminDashboardRoutes);
  app.use(`${API_PREFIX}/admin/document-types`, adminDocumentTypeRoutes);
  app.use(`${API_PREFIX}/admin/documents`, adminDocumentRoutes);
  app.use(`${API_PREFIX}/document-types`, documentTypeRoutes);
  app.use(`${API_PREFIX}/admin/job-taxonomies`, adminJobTaxonomyRoutes);
  app.use(`${API_PREFIX}/job-taxonomies`, jobTaxonomyRoutes);
  app.use(`${API_PREFIX}/user/career-profile`, careerProfileRoutes);
  app.use(`${API_PREFIX}/user/resume-configurations`, resumeConfigurationRoutes);
  app.use(`${API_PREFIX}/admin/resume-templates`, adminResumeTemplateRoutes);
  app.use(`${API_PREFIX}/resume-templates`, resumeTemplateRoutes);
  app.use(`${API_PREFIX}/notifications`, notificationRoutes);
  app.use(`${API_PREFIX}/admin/banners`, adminBannerRoutes);
  app.use(`${API_PREFIX}/banners`, bannerRoutes);
  app.use(`${API_PREFIX}/admin/search`, adminSearchRoutes);
  app.use(`${API_PREFIX}/search`, searchRoutes);
  app.use(`${API_PREFIX}/consultancy`, consultancyRoutes);
  app.use(`${API_PREFIX}/admin/consultancy`, adminConsultancyRoutes);
  app.use(`${API_PREFIX}/wallet`, walletRoutes);
  app.use(`${API_PREFIX}/support`, supportInquiryRoutes);
  app.use(`${API_PREFIX}/admin/support`, adminSupportInquiryRoutes);
  app.use(`${API_PREFIX}/geo`, geoRoutes);

  // 404 handler — must be registered after all valid routes.
  app.use((req, res, next) => {
    next(new AppError(AUTH_MESSAGES.NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND'));
  });
};

module.exports = setupRoutes;
