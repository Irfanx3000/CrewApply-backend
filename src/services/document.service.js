'use strict';

const fs = require('fs');
const path = require('path');
const Document = require('../models/document.model');
const DocumentType = require('../models/documentType.model');
const User = require('../models/user.model');
const { saveFile } = require('./storage.service');
const { convertToWebp } = require('../utils/image.util');
const { detectFileMimeType } = require('../utils/fileSignature.util');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

// Real (magic-byte-detected) mime values only — never the client-declared one.
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const PDF_MIME = 'application/pdf';

const deleteTempFile = (tempPath) => {
  if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
};

/**
 * Verifies a saved file's REAL content type (via magic bytes) against an
 * allow-list, ignoring the client-declared Content-Type/extension entirely.
 * Deletes the temp file and throws a 400 on any mismatch or unrecognized file.
 *
 * @param {string} filePath
 * @param {string[]} allowedMimes
 * @returns {string} the detected mime type (only returned on success)
 */
const assertRealFileType = (filePath, allowedMimes) => {
  const detected = detectFileMimeType(filePath);
  if (!detected || !allowedMimes.includes(detected)) {
    deleteTempFile(filePath);
    throw new AppError(AUTH_MESSAGES.INVALID_FILE_TYPE, HTTP_STATUS.BAD_REQUEST, 'INVALID_FILE_TYPE');
  }
  return detected;
};

// ── Profile completion ────────────────────────────────────────────────────────

/**
 * Computes the profile completion percentage for a user.
 * Weights: Personal=20, Photo=10, Maritime=20, Resume=20, Certificates=20, Passport=5, Medical=5
 *
 * @param {object} user     - Mongoose User document
 * @returns {Promise<number>}
 */
const computeProfileCompletion = async (user) => {
  let score = 0;

  // Personal information (20%)
  const personalFields = [
    user.name, user.email, user.phone,
    user.dateOfBirth, user.gender,
    user.nationality, user.country, user.state, user.city,
  ];
  const filledPersonal = personalFields.filter(Boolean).length;
  score += Math.round((filledPersonal / personalFields.length) * 20);

  // Profile photo (10%)
  if (user.avatar) score += 10;

  // Maritime profile (20%)
  if (user.maritimeProfile && (user.maritimeProfile.department || user.maritimeProfile.rank)) {
    score += 20;
  }

  // Documents — run queries in parallel
  const [resumeDoc, certDoc, passportDoc, medicalDoc] = await Promise.all([
    Document.exists({ user: user._id, category: 'resume', status: 'active' }),
    Document.exists({ user: user._id, category: { $in: ['certificate', 'stcw'] }, status: 'active' }),
    Document.exists({ user: user._id, category: 'passport', status: 'active' }),
    Document.exists({ user: user._id, category: 'medical', status: 'active' }),
  ]);

  if (resumeDoc)   score += 20; // Resume (20%)
  if (certDoc)     score += 20; // Certificates (20%)
  if (passportDoc) score += 5;  // Passport (5%)
  if (medicalDoc)  score += 5;  // Medical (5%)

  return Math.min(score, 100);
};

// ── Upload helpers ────────────────────────────────────────────────────────────

/**
 * Archives all currently active documents for a user in a given category.
 * Used for single-document categories (resume, passport, cdc, medical).
 */
const archivePrevious = async (userId, category) => {
  await Document.updateMany(
    { user: userId, category, status: 'active' },
    { $set: { status: 'archived' } }
  );
};

/**
 * Core upload function. Moves the temp file to its final directory,
 * saves the document record, and returns the document.
 *
 * @param {object} opts
 * @param {string}  opts.userId
 * @param {object}  opts.file       - req.file from multer
 * @param {string}  opts.category
 * @param {string}  [opts.type]     - sub-type for certificate/stcw
 * @param {object}  [opts.metadata]
 * @param {string}  opts.destDir    - subdirectory inside uploads/
 */
const uploadDocument = async ({ userId, file, category, type, metadata, destDir, mimeType }) => {
  const relativePath = saveFile(file.path, destDir, file.filename);

  const doc = await Document.create({
    user: userId,
    category,
    type: type || null,
    originalName: file.originalname,
    storedName: file.filename,
    path: relativePath,
    // Prefer the magic-byte-detected mime type over the client-declared one.
    mimeType: mimeType || file.mimetype,
    size: file.size,
    metadata: metadata || {},
  });

  return doc;
};

// ── Profile photo ─────────────────────────────────────────────────────────────

const uploadProfilePhoto = async (userId, file) => {
  assertRealFileType(file.path, IMAGE_MIMES);

  const outputFilename = `${path.parse(file.filename).name}.webp`;
  const outputPath = path.join(path.dirname(file.path), '..', 'profile', outputFilename);

  await convertToWebp(file.path, outputPath, { resize: [400, 400, { fit: 'cover', position: 'centre' }] });
  deleteTempFile(file.path);

  const relativePath = `uploads/profile/${outputFilename}`;

  // Archive previous profile_photo doc
  await archivePrevious(userId, 'profile_photo');

  const doc = await Document.create({
    user: userId,
    category: 'profile_photo',
    originalName: file.originalname,
    storedName: outputFilename,
    path: relativePath,
    mimeType: 'image/webp',
    size: file.size,
  });

  // Update user.avatar
  await User.findByIdAndUpdate(userId, { avatar: relativePath });

  return doc;
};

// ── Resume ────────────────────────────────────────────────────────────────────

const uploadResume = async (userId, file) => {
  const mimeType = assertRealFileType(file.path, [PDF_MIME]);
  await archivePrevious(userId, 'resume');
  return uploadDocument({ userId, file, category: 'resume', destDir: 'resumes', mimeType });
};

const getResume = (userId) =>
  Document.findOne({ user: userId, category: 'resume', status: 'active' }).lean();

// ── Certificates & STCW ───────────────────────────────────────────────────────

const uploadCertificates = async (userId, files, metadataArray) => {
  const docs = [];
  for (let i = 0; i < files.length; i++) {
    const mimeType = assertRealFileType(files[i].path, [PDF_MIME, ...IMAGE_MIMES]);
    const meta = metadataArray?.[i] || {};
    const { type, issueDate, expiryDate, issuingAuthority } = meta;
    const doc = await uploadDocument({
      userId,
      file: files[i],
      category: type && isStwcType(type) ? 'stcw' : 'certificate',
      type: type || null,
      metadata: { issueDate, expiryDate, issuingAuthority },
      destDir: 'certificates',
      mimeType,
    });
    docs.push(doc);
  }
  return docs;
};

const STCW_TYPES = new Set([
  'Basic Safety', 'AFF', 'PST', 'FPFF', 'EFA',
  'Security Awareness', 'GMDSS', 'COC', 'COP',
  'Engine Course', 'Deck Course', 'Radar', 'ARPA', 'ECDIS',
]);

const isStwcType = (type) => STCW_TYPES.has(type);

const getCertificates = (userId) =>
  Document.find({
    user: userId,
    category: { $in: ['certificate', 'stcw'] },
    status: 'active',
  }).lean();

// ── Passport ──────────────────────────────────────────────────────────────────

const uploadPassport = async (userId, file, metadata) => {
  const mimeType = assertRealFileType(file.path, [PDF_MIME, ...IMAGE_MIMES]);
  await archivePrevious(userId, 'passport');
  return uploadDocument({ userId, file, category: 'passport', metadata, destDir: 'passport', mimeType });
};

const getPassport = (userId) =>
  Document.findOne({ user: userId, category: 'passport', status: 'active' }).lean();

// ── CDC ───────────────────────────────────────────────────────────────────────

const uploadCdc = async (userId, file, metadata) => {
  const mimeType = assertRealFileType(file.path, [PDF_MIME, ...IMAGE_MIMES]);
  await archivePrevious(userId, 'cdc');
  return uploadDocument({ userId, file, category: 'cdc', metadata, destDir: 'cdc', mimeType });
};

const getCdc = (userId) =>
  Document.findOne({ user: userId, category: 'cdc', status: 'active' }).lean();

// ── Medical ───────────────────────────────────────────────────────────────────

const uploadMedical = async (userId, file, metadata) => {
  const mimeType = assertRealFileType(file.path, [PDF_MIME, ...IMAGE_MIMES]);
  await archivePrevious(userId, 'medical');
  return uploadDocument({ userId, file, category: 'medical', metadata, destDir: 'medical', mimeType });
};

const getMedical = (userId) =>
  Document.findOne({ user: userId, category: 'medical', status: 'active' }).lean();

// ── Visa ──────────────────────────────────────────────────────────────────────

const uploadVisa = async (userId, files, metadataArray) => {
  const docs = [];
  for (let i = 0; i < files.length; i++) {
    const mimeType = assertRealFileType(files[i].path, [PDF_MIME, ...IMAGE_MIMES]);
    const meta = metadataArray?.[i] || {};
    const doc = await uploadDocument({
      userId,
      file: files[i],
      category: 'visa',
      metadata: { country: meta.country, visaNumber: meta.visaNumber, expiryDate: meta.expiryDate },
      destDir: 'visa',
      mimeType,
    });
    docs.push(doc);
  }
  return docs;
};

const getVisa = (userId) =>
  Document.find({ user: userId, category: 'visa', status: 'active' }).lean();

// ── Generic upload (admin-configurable document types) ────────────────────────

/**
 * Uploads a document for any active DocumentType. Unlike the per-category
 * helpers above, the accepted file types/max size are looked up dynamically
 * (not enforced by multer's static per-route config), so this function does
 * the strict validation itself and cleans up the temp file on any rejection.
 *
 * @param {string} userId
 * @param {object} file       - req.file from multer (genericDocumentUpload)
 * @param {string} category   - DocumentType.key
 * @param {string} [metadataRaw] - optional JSON string
 */
const uploadDocumentGeneric = async (userId, file, category, metadataRaw) => {
  const docType = await DocumentType.findOne({ key: category, isActive: true }).lean();
  if (!docType) {
    deleteTempFile(file.path);
    throw new AppError(AUTH_MESSAGES.INVALID_DOCUMENT_CATEGORY, HTTP_STATUS.BAD_REQUEST, 'INVALID_CATEGORY');
  }

  const allowedMimes =
    docType.acceptedFileTypes === 'pdf' ? [PDF_MIME] :
    docType.acceptedFileTypes === 'image' ? IMAGE_MIMES :
    [PDF_MIME, ...IMAGE_MIMES];

  // Ignores file.mimetype (client-declared, spoofable) — validates the file's
  // actual content via its magic-byte signature instead.
  const detectedMime = assertRealFileType(file.path, allowedMimes);
  const isImage = IMAGE_MIMES.includes(detectedMime);

  if (file.size > docType.maxSizeMB * 1024 * 1024) {
    deleteTempFile(file.path);
    throw new AppError(AUTH_MESSAGES.FILE_TOO_LARGE, HTTP_STATUS.BAD_REQUEST, 'FILE_TOO_LARGE');
  }

  if (!docType.allowMultiple) {
    await archivePrevious(userId, docType.key);
  }

  let relativePath;
  let mimeType = detectedMime;
  let storedName = file.filename;
  let size = file.size;

  if (isImage) {
    // No forced crop (unlike profile photo) — passport/certificate scans must
    // keep their aspect ratio.
    const outputFilename = `${path.parse(file.filename).name}.webp`;
    const outputPath = path.join(path.dirname(file.path), '..', 'documents', outputFilename);
    await convertToWebp(file.path, outputPath, { resize: { width: 1600, withoutEnlargement: true } });
    deleteTempFile(file.path);

    relativePath = `uploads/documents/${outputFilename}`;
    mimeType = 'image/webp';
    storedName = outputFilename;
    size = fs.statSync(outputPath).size;
  } else {
    relativePath = saveFile(file.path, 'documents', file.filename);
  }

  let metadata = {};
  if (metadataRaw) {
    try {
      metadata = typeof metadataRaw === 'string' ? JSON.parse(metadataRaw) : metadataRaw;
    } catch {
      metadata = {};
    }
  }

  return Document.create({
    user: userId,
    category: docType.key,
    originalName: file.originalname,
    storedName,
    path: relativePath,
    mimeType,
    size,
    metadata,
  });
};

// ── Delete (soft) ─────────────────────────────────────────────────────────────

const deleteDocument = async (userId, docId) => {
  const doc = await Document.findOne({ _id: docId, user: userId });
  if (!doc) {
    throw new AppError('Document not found.', HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }
  doc.status = 'archived';
  await doc.save();
  return doc;
};

// ── All documents grouped ─────────────────────────────────────────────────────

const getAllDocuments = async (userId) => {
  const docs = await Document.find({ user: userId, status: 'active' }).lean();
  return docs.reduce((acc, doc) => {
    if (!acc[doc.category]) acc[doc.category] = [];
    acc[doc.category].push(doc);
    return acc;
  }, {});
};

// ── View (owner-only, streamed via a short-lived view token — see token.service.js) ──

/**
 * Resolves a document to its on-disk location, verifying ownership. Used by
 * both the view-token minting step and the actual file-serving route — always
 * re-checked against current DB state, never trusts the token alone.
 */
const getDocumentFile = async (userId, docId) => {
  const doc = await Document.findOne({ _id: docId, user: userId, status: 'active' }).lean();
  if (!doc) {
    throw new AppError(AUTH_MESSAGES.DOCUMENT_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  const absolutePath = path.join(__dirname, '..', doc.path);
  if (!fs.existsSync(absolutePath)) {
    throw new AppError(AUTH_MESSAGES.DOCUMENT_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  return { absolutePath, mimeType: doc.mimeType, originalName: doc.originalName };
};

/**
 * Admin equivalent of getDocumentFile — no ownership restriction (an admin can
 * review any applicant's submitted documents), but still requires the document
 * to be active and to actually exist on disk. Gated by normal admin auth at
 * the route level (authenticate + authorize(ADMIN)), not a scoped view token —
 * a web admin panel can attach a real Authorization header, unlike the mobile
 * app's <Image>/Linking.openURL flows that needed the token-in-URL workaround.
 */
const getAdminDocumentFile = async (docId) => {
  const doc = await Document.findOne({ _id: docId, status: 'active' }).lean();
  if (!doc) {
    throw new AppError(AUTH_MESSAGES.DOCUMENT_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  const absolutePath = path.join(__dirname, '..', doc.path);
  if (!fs.existsSync(absolutePath)) {
    throw new AppError(AUTH_MESSAGES.DOCUMENT_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  return { absolutePath, mimeType: doc.mimeType, originalName: doc.originalName, ownerUserId: doc.user };
};

module.exports = {
  computeProfileCompletion,
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
  uploadDocumentGeneric,
  deleteDocument,
  getAllDocuments,
  getDocumentFile,
  getAdminDocumentFile,
};
