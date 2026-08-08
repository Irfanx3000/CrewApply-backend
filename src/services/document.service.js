'use strict';

const fs = require('fs');
const path = require('path');
const Document = require('../models/document.model');
const DocumentType = require('../models/documentType.model');
const User = require('../models/user.model');
const ResumeConfiguration = require('../models/resumeConfiguration.model');
const Application = require('../models/application.model');
const { saveFile } = require('./storage.service');
const { convertToWebp } = require('../utils/image.util');
const { assertRealFileType, deleteTempFile } = require('../utils/uploadGuard.util');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

// Real (magic-byte-detected) mime values only — never the client-declared one.
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const PDF_MIME = 'application/pdf';

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
    // Document.type is the schema's own sub-type field (e.g. certificate
    // name) — lifted out of the freeform metadata blob when the caller sends
    // one, so callers like getVerifiedCertificates() that read doc.type
    // directly (not doc.metadata.type) see it.
    type: metadata.type || null,
    originalName: file.originalname,
    storedName,
    path: relativePath,
    mimeType,
    size,
    metadata,
  });
};

// ── Delete (soft) ─────────────────────────────────────────────────────────────

/**
 * Clears every OTHER record that points at a document we just archived, so
 * nothing in the app keeps advertising a file the user has deleted.
 *
 * Most Document-derived reads are already live queries filtered on
 * `status: 'active'` (the Career Profile's certificates/travel documents, the
 * Documents list, profile completion), so they self-correct. These two are
 * the exceptions — they store the document's id (or path) on another
 * collection, and would otherwise stay pointing at an archived file forever:
 *
 *   1. User.avatar — a denormalized copy of the profile photo's path, read by
 *      the header, sidebar and the Career Profile's Personal section.
 *   2. ResumeConfiguration.metadata — the "My Resumes" row on the Career
 *      Profile screen offers View/Download purely because
 *      lastGeneratedDocumentId is set; leaving it set after the PDF is gone
 *      gives the user a button that can only 404.
 *
 * Never touches Application.submittedDocuments: an application's document
 * snapshot is deliberately immutable once submitted (see applyToJob), and the
 * archived Document row plus its file both survive precisely so an admin can
 * still open exactly what was sent — see getAdminDocumentFile below.
 */
const propagateDocumentRemoval = async (doc) => {
  if (doc.category === 'profile_photo') {
    // Guarded on the path so a stale delete (e.g. archiving an older photo
    // after a newer one was uploaded) can't wipe the current avatar.
    await User.updateOne({ _id: doc.user, avatar: doc.path }, { $set: { avatar: null } });
  }

  const resumeConfigurationId = doc.generatedFrom?.resumeConfigurationId;
  if (doc.source === 'generated' && resumeConfigurationId) {
    await ResumeConfiguration.updateOne(
      { _id: resumeConfigurationId, user: doc.user },
      { $pull: { 'metadata.generatedDocumentIds': doc._id } }
    );
    // Only the CURRENT generation resets the row back to "not generated yet";
    // deleting some older version leaves the latest one intact.
    await ResumeConfiguration.updateOne(
      { _id: resumeConfigurationId, user: doc.user, 'metadata.lastGeneratedDocumentId': doc._id },
      {
        $set: {
          'metadata.lastGeneratedDocumentId': null,
          'metadata.lastGeneratedAt': null,
          'metadata.contentHashAtLastGeneration': null,
        },
      }
    );
  }
};

const deleteDocument = async (userId, docId) => {
  const doc = await Document.findOne({ _id: docId, user: userId });
  if (!doc) {
    throw new AppError('Document not found.', HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }
  doc.status = 'archived';
  await doc.save();
  await propagateDocumentRemoval(doc);
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
 * to actually exist on disk. Gated by normal admin auth at the route level
 * (authenticate + authorize(ADMIN)), not a scoped view token — a web admin
 * panel can attach a real Authorization header, unlike the mobile app's
 * <Image>/Linking.openURL flows that needed the token-in-URL workaround.
 *
 * Archived documents stay readable here IF they were submitted with an
 * application. Without that exemption a user could effectively retract
 * evidence after the fact: deleting (or re-uploading, which archives the
 * previous copy) a file already sent to a recruiter would turn the admin's
 * view of that application into a 404. What was submitted is fixed at
 * apply-time and must remain viewable for as long as the application exists.
 * Archived documents that were NEVER submitted stay unreadable, as before.
 */
const getAdminDocumentFile = async (docId) => {
  const doc = await Document.findById(docId).lean();
  if (!doc) {
    throw new AppError(AUTH_MESSAGES.DOCUMENT_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  if (doc.status !== 'active') {
    const wasSubmitted = await Application.exists({ 'submittedDocuments.document': doc._id });
    if (!wasSubmitted) {
      throw new AppError(AUTH_MESSAGES.DOCUMENT_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
    }
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
