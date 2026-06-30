'use strict';

const path = require('path');
const sharp = require('sharp');
const Document = require('../models/document.model');
const User = require('../models/user.model');
const { saveFile, deleteFile } = require('./storage.service');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');

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
const uploadDocument = async ({ userId, file, category, type, metadata, destDir }) => {
  const relativePath = saveFile(file.path, destDir, file.filename);

  const doc = await Document.create({
    user: userId,
    category,
    type: type || null,
    originalName: file.originalname,
    storedName: file.filename,
    path: relativePath,
    mimeType: file.mimetype,
    size: file.size,
    metadata: metadata || {},
  });

  return doc;
};

// ── Profile photo ─────────────────────────────────────────────────────────────

const uploadProfilePhoto = async (userId, file) => {
  const outputFilename = `${path.parse(file.filename).name}.webp`;
  const outputPath = path.join(path.dirname(file.path), '..', 'profile', outputFilename);

  // Process with Sharp: resize to 400×400 WebP
  await sharp(file.path)
    .resize(400, 400, { fit: 'cover', position: 'centre' })
    .webp({ quality: 85 })
    .toFile(outputPath);

  // Remove temp file
  deleteFile(null); // sharp already wrote to final dir directly — just delete temp
  const fs = require('fs');
  if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

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
  await archivePrevious(userId, 'resume');
  return uploadDocument({ userId, file, category: 'resume', destDir: 'resumes' });
};

const getResume = (userId) =>
  Document.findOne({ user: userId, category: 'resume', status: 'active' }).lean();

// ── Certificates & STCW ───────────────────────────────────────────────────────

const uploadCertificates = async (userId, files, metadataArray) => {
  const docs = [];
  for (let i = 0; i < files.length; i++) {
    const meta = metadataArray?.[i] || {};
    const { type, issueDate, expiryDate, issuingAuthority } = meta;
    const doc = await uploadDocument({
      userId,
      file: files[i],
      category: type && isStwcType(type) ? 'stcw' : 'certificate',
      type: type || null,
      metadata: { issueDate, expiryDate, issuingAuthority },
      destDir: 'certificates',
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
  await archivePrevious(userId, 'passport');
  return uploadDocument({ userId, file, category: 'passport', metadata, destDir: 'passport' });
};

const getPassport = (userId) =>
  Document.findOne({ user: userId, category: 'passport', status: 'active' }).lean();

// ── CDC ───────────────────────────────────────────────────────────────────────

const uploadCdc = async (userId, file, metadata) => {
  await archivePrevious(userId, 'cdc');
  return uploadDocument({ userId, file, category: 'cdc', metadata, destDir: 'cdc' });
};

const getCdc = (userId) =>
  Document.findOne({ user: userId, category: 'cdc', status: 'active' }).lean();

// ── Medical ───────────────────────────────────────────────────────────────────

const uploadMedical = async (userId, file, metadata) => {
  await archivePrevious(userId, 'medical');
  return uploadDocument({ userId, file, category: 'medical', metadata, destDir: 'medical' });
};

const getMedical = (userId) =>
  Document.findOne({ user: userId, category: 'medical', status: 'active' }).lean();

// ── Visa ──────────────────────────────────────────────────────────────────────

const uploadVisa = async (userId, files, metadataArray) => {
  const docs = [];
  for (let i = 0; i < files.length; i++) {
    const meta = metadataArray?.[i] || {};
    const doc = await uploadDocument({
      userId,
      file: files[i],
      category: 'visa',
      metadata: { country: meta.country, visaNumber: meta.visaNumber, expiryDate: meta.expiryDate },
      destDir: 'visa',
    });
    docs.push(doc);
  }
  return docs;
};

const getVisa = (userId) =>
  Document.find({ user: userId, category: 'visa', status: 'active' }).lean();

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
  deleteDocument,
  getAllDocuments,
};
