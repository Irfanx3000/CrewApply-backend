'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/authorize.middleware');
const validate = require('../middleware/validate.middleware');
const { successResponse } = require('../utils/apiResponse');
const { ROLES } = require('../constants/roles');

const userController = require('../controllers/user.controller');
const documentController = require('../controllers/document.controller');
const referralController = require('../controllers/referral.controller');
const userValidation = require('../validations/user.validation');

const {
  profileUpload,
  resumeUpload,
  documentUpload,
  certificateUpload,
  visaUpload,
  genericDocumentUpload,
} = require('../middleware/upload.middleware');
const requireDocumentViewToken = require('../middleware/documentViewToken.middleware');

// ── Profile ───────────────────────────────────────────────────────────────────

router.get('/profile',        authenticate,                                                              userController.getProfile);
router.patch('/profile',      authenticate, validate(userValidation.updateProfile),                     userController.updateProfile);
router.patch('/profile-photo',authenticate, profileUpload.single('file'),                               documentController.uploadProfilePhoto);
router.patch('/maritime-profile', authenticate, validate(userValidation.updateMaritimeProfile),         userController.updateMaritimeProfile);
router.get('/preferences',    authenticate,                                                              userController.getPreferences);
router.patch('/preferences',  authenticate, validate(userValidation.updatePreferences),                 userController.updatePreferences);

// ── Resume ────────────────────────────────────────────────────────────────────

router.post('/resume',        authenticate, resumeUpload.single('file'),                                documentController.uploadResume);
router.get('/resume',         authenticate,                                                              documentController.getResume);

// ── Certificates & STCW ───────────────────────────────────────────────────────

router.post('/certificates',          authenticate, certificateUpload.array('files', 10),               documentController.uploadCertificates);
router.get('/certificates',           authenticate,                                                      documentController.getCertificates);
router.delete('/certificates/:id',    authenticate, validate(userValidation.documentIdParam),            documentController.deleteDocument);

// ── Passport ──────────────────────────────────────────────────────────────────

router.post('/passport',      authenticate, documentUpload.single('file'), validate(userValidation.passportMetadata), documentController.uploadPassport);
router.get('/passport',       authenticate,                                                              documentController.getPassport);

// ── CDC ───────────────────────────────────────────────────────────────────────

router.post('/cdc',           authenticate, documentUpload.single('file'), validate(userValidation.cdcMetadata),      documentController.uploadCdc);
router.get('/cdc',            authenticate,                                                              documentController.getCdc);

// ── Medical ───────────────────────────────────────────────────────────────────

router.post('/medical',       authenticate, documentUpload.single('file'), validate(userValidation.medicalMetadata),  documentController.uploadMedical);
router.get('/medical',        authenticate,                                                              documentController.getMedical);

// ── Visa ──────────────────────────────────────────────────────────────────────

router.post('/visa',          authenticate, visaUpload.array('files', 10),                              documentController.uploadVisa);
router.get('/visa',           authenticate,                                                              documentController.getVisa);
router.delete('/visa/:id',    authenticate, validate(userValidation.documentIdParam),                   documentController.deleteDocument);

// ── All documents ─────────────────────────────────────────────────────────────

router.get('/documents',      authenticate,                                                              documentController.getAllDocuments);
router.post('/documents',     authenticate, genericDocumentUpload.single('file'), validate(userValidation.uploadDocumentBody), documentController.uploadDocumentGeneric);
router.get('/documents/:id/view-token', authenticate, validate(userValidation.documentIdParam),           documentController.getDocumentViewToken);
// Deliberately NOT `authenticate` — see documentViewToken.middleware.js for why.
router.get('/documents/:id/file', requireDocumentViewToken, validate(userValidation.documentIdParam),     documentController.getDocumentFile);
router.delete('/documents/:id', authenticate, validate(userValidation.documentIdParam),                   documentController.deleteDocument);

// ── Referrals & wallet ────────────────────────────────────────────────────────

router.get('/referral', authenticate, referralController.getMyReferral);
router.post('/referral/generate', authenticate, referralController.generateReferralCode);

// ── Admin ─────────────────────────────────────────────────────────────────────

router.get('/admin-only', authenticate, authorize(ROLES.ADMIN), (req, res) => {
  return successResponse(res, 'Admin area accessible.', { userId: req.user._id });
});

module.exports = router;
