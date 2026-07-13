'use strict';

const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { UPLOADS_ROOT } = require('../services/storage.service');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');

// ── Helpers ───────────────────────────────────────────────────────────────────

const generateStoredName = (originalname) => {
  const ext = path.extname(originalname).toLowerCase();
  return `${crypto.randomUUID()}${ext}`;
};

const BLOCKED_MIMES = new Set([
  'application/x-msdownload',
  'application/x-executable',
  'application/x-sh',
  'application/x-bat',
  'application/octet-stream',
  'text/x-shellscript',
]);

const makeFilter = (allowedMimes, label) => (_req, file, cb) => {
  if (BLOCKED_MIMES.has(file.mimetype)) {
    return cb(new AppError(`Executable files are not allowed.`, HTTP_STATUS.BAD_REQUEST, 'INVALID_FILE_TYPE'));
  }
  if (!allowedMimes.includes(file.mimetype)) {
    return cb(new AppError(`Invalid file type for ${label}. Allowed: ${allowedMimes.join(', ')}.`, HTTP_STATUS.BAD_REQUEST, 'INVALID_FILE_TYPE'));
  }
  cb(null, true);
};

// All uploads land in temp first; controllers move them to their final directory
const tempStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const tempDir = path.join(UPLOADS_ROOT, 'temp');
    cb(null, tempDir);
  },
  filename: (_req, file, cb) => {
    cb(null, generateStoredName(file.originalname));
  },
});

const MB = 1024 * 1024;

// ── Upload configs ────────────────────────────────────────────────────────────

/**
 * Profile photo — single file, image only, 2 MB
 * Sharp will convert to WebP 400×400 in the controller.
 */
const profileUpload = multer({
  storage: tempStorage,
  limits: { fileSize: 2 * MB },
  fileFilter: makeFilter(
    ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    'profile photo'
  ),
});

/**
 * Resume — single PDF, 5 MB
 */
const resumeUpload = multer({
  storage: tempStorage,
  limits: { fileSize: 5 * MB },
  fileFilter: makeFilter(['application/pdf'], 'resume'),
});

/**
 * Generic single document — passport, CDC, medical (PDF or image), 10 MB
 */
const documentUpload = multer({
  storage: tempStorage,
  limits: { fileSize: 10 * MB },
  fileFilter: makeFilter(
    ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
    'document'
  ),
});

/**
 * Certificates / STCW — up to 10 files, PDF or image, 10 MB each
 */
const certificateUpload = multer({
  storage: tempStorage,
  limits: { fileSize: 10 * MB },
  fileFilter: makeFilter(
    ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
    'certificate'
  ),
});

/**
 * Visa — up to 10 files, PDF or image, 10 MB each
 */
const visaUpload = multer({
  storage: tempStorage,
  limits: { fileSize: 10 * MB },
  fileFilter: makeFilter(
    ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
    'visa'
  ),
});

/**
 * Generic document upload for admin-configurable DocumentTypes — PDF or image,
 * 20 MB ceiling. The per-type mime/size rules (from DocumentType.acceptedFileTypes/
 * maxSizeMB) can't be enforced here since `req.body.category` isn't reliably
 * populated yet when this fileFilter runs; document.service.js's
 * uploadDocumentGeneric() does that strict check after the file lands in temp.
 */
const genericDocumentUpload = multer({
  storage: tempStorage,
  limits: { fileSize: 20 * MB },
  fileFilter: makeFilter(
    ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    'document'
  ),
});

module.exports = {
  profileUpload,
  resumeUpload,
  documentUpload,
  certificateUpload,
  visaUpload,
  genericDocumentUpload,
};
