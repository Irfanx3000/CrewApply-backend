'use strict';

const documentService = require('../services/document.service');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/apiResponse');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

// ── Profile Photo ─────────────────────────────────────────────────────────────

const uploadProfilePhoto = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError(AUTH_MESSAGES.NO_FILE_UPLOADED, HTTP_STATUS.BAD_REQUEST, 'NO_FILE');
  }

  const doc = await documentService.uploadProfilePhoto(req.user._id, req.file);

  return successResponse(res, AUTH_MESSAGES.PROFILE_PHOTO_UPDATED, { document: doc });
});

// ── Resume ────────────────────────────────────────────────────────────────────

const uploadResume = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError(AUTH_MESSAGES.NO_FILE_UPLOADED, HTTP_STATUS.BAD_REQUEST, 'NO_FILE');
  }

  const doc = await documentService.uploadResume(req.user._id, req.file);

  return successResponse(res, AUTH_MESSAGES.RESUME_UPLOADED, { document: doc }, HTTP_STATUS.CREATED);
});

const getResume = asyncHandler(async (req, res) => {
  const doc = await documentService.getResume(req.user._id);

  return successResponse(res, AUTH_MESSAGES.RESUME_FETCHED, { document: doc });
});

// ── Certificates ──────────────────────────────────────────────────────────────

const uploadCertificates = asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    throw new AppError(AUTH_MESSAGES.NO_FILE_UPLOADED, HTTP_STATUS.BAD_REQUEST, 'NO_FILE');
  }

  let metadataArray = [];
  if (req.body.metadata) {
    try {
      metadataArray = typeof req.body.metadata === 'string'
        ? JSON.parse(req.body.metadata)
        : req.body.metadata;
    } catch {
      // fall through with empty metadata
    }
  }

  // Support flat single-cert fields when uploading one file
  if (!metadataArray.length && req.files.length === 1) {
    metadataArray = [{
      type: req.body.type,
      issueDate: req.body.issueDate,
      expiryDate: req.body.expiryDate,
      issuingAuthority: req.body.issuingAuthority,
    }];
  }

  const docs = await documentService.uploadCertificates(req.user._id, req.files, metadataArray);

  return successResponse(res, AUTH_MESSAGES.CERTIFICATES_UPLOADED, { documents: docs }, HTTP_STATUS.CREATED);
});

const getCertificates = asyncHandler(async (req, res) => {
  const docs = await documentService.getCertificates(req.user._id);

  return successResponse(res, AUTH_MESSAGES.CERTIFICATES_FETCHED, { documents: docs });
});

// ── Passport ──────────────────────────────────────────────────────────────────

const uploadPassport = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError(AUTH_MESSAGES.NO_FILE_UPLOADED, HTTP_STATUS.BAD_REQUEST, 'NO_FILE');
  }

  const metadata = {
    passportNumber: req.body.passportNumber,
    expiryDate: req.body.expiryDate,
    nationality: req.body.nationality,
  };

  const doc = await documentService.uploadPassport(req.user._id, req.file, metadata);

  return successResponse(res, AUTH_MESSAGES.PASSPORT_UPLOADED, { document: doc }, HTTP_STATUS.CREATED);
});

const getPassport = asyncHandler(async (req, res) => {
  const doc = await documentService.getPassport(req.user._id);

  return successResponse(res, AUTH_MESSAGES.PASSPORT_FETCHED, { document: doc });
});

// ── CDC ───────────────────────────────────────────────────────────────────────

const uploadCdc = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError(AUTH_MESSAGES.NO_FILE_UPLOADED, HTTP_STATUS.BAD_REQUEST, 'NO_FILE');
  }

  const metadata = {
    cdcNumber: req.body.cdcNumber,
    country: req.body.country,
    expiryDate: req.body.expiryDate,
  };

  const doc = await documentService.uploadCdc(req.user._id, req.file, metadata);

  return successResponse(res, AUTH_MESSAGES.CDC_UPLOADED, { document: doc }, HTTP_STATUS.CREATED);
});

const getCdc = asyncHandler(async (req, res) => {
  const doc = await documentService.getCdc(req.user._id);

  return successResponse(res, AUTH_MESSAGES.CDC_FETCHED, { document: doc });
});

// ── Medical ───────────────────────────────────────────────────────────────────

const uploadMedical = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError(AUTH_MESSAGES.NO_FILE_UPLOADED, HTTP_STATUS.BAD_REQUEST, 'NO_FILE');
  }

  const metadata = {
    expiryDate: req.body.expiryDate,
    doctor: req.body.doctor,
    hospital: req.body.hospital,
  };

  const doc = await documentService.uploadMedical(req.user._id, req.file, metadata);

  return successResponse(res, AUTH_MESSAGES.MEDICAL_UPLOADED, { document: doc }, HTTP_STATUS.CREATED);
});

const getMedical = asyncHandler(async (req, res) => {
  const doc = await documentService.getMedical(req.user._id);

  return successResponse(res, AUTH_MESSAGES.MEDICAL_FETCHED, { document: doc });
});

// ── Visa ──────────────────────────────────────────────────────────────────────

const uploadVisa = asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    throw new AppError(AUTH_MESSAGES.NO_FILE_UPLOADED, HTTP_STATUS.BAD_REQUEST, 'NO_FILE');
  }

  let metadataArray = [];
  if (req.body.metadata) {
    try {
      metadataArray = typeof req.body.metadata === 'string'
        ? JSON.parse(req.body.metadata)
        : req.body.metadata;
    } catch {
      // fall through
    }
  }

  if (!metadataArray.length && req.files.length === 1) {
    metadataArray = [{
      country: req.body.country,
      visaNumber: req.body.visaNumber,
      expiryDate: req.body.expiryDate,
    }];
  }

  const docs = await documentService.uploadVisa(req.user._id, req.files, metadataArray);

  return successResponse(res, AUTH_MESSAGES.VISA_UPLOADED, { documents: docs }, HTTP_STATUS.CREATED);
});

const getVisa = asyncHandler(async (req, res) => {
  const docs = await documentService.getVisa(req.user._id);

  return successResponse(res, AUTH_MESSAGES.VISA_FETCHED, { documents: docs });
});

// ── Delete (soft) ─────────────────────────────────────────────────────────────

const deleteDocument = asyncHandler(async (req, res) => {
  const doc = await documentService.deleteDocument(req.user._id, req.params.id);

  return successResponse(res, AUTH_MESSAGES.DOCUMENT_DELETED, { document: doc });
});

// ── All documents ─────────────────────────────────────────────────────────────

const getAllDocuments = asyncHandler(async (req, res) => {
  const grouped = await documentService.getAllDocuments(req.user._id);

  return successResponse(res, AUTH_MESSAGES.DOCUMENTS_FETCHED, { documents: grouped });
});

module.exports = {
  uploadProfilePhoto,
  uploadResume,
  getResume,
  uploadCertificates,
  getCertificates,
  uploadPassport,
  getPassport,
  uploadCdc,
  getCdc,
  uploadMedical,
  getMedical,
  uploadVisa,
  getVisa,
  deleteDocument,
  getAllDocuments,
};
