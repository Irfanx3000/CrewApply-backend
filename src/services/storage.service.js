'use strict';

const fs = require('fs');
const path = require('path');

// Base uploads directory. The physical folders (temp/, profile/, resumes/, …)
// live under src/uploads, so resolve to there — __dirname is src/services.
const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');

// Ensure the standard subdirectories exist so multer/sharp can always write.
for (const dir of ['temp', 'profile', 'resumes', 'certificates', 'company', 'documents', 'banners', 'category-icons']) {
  const full = path.join(UPLOADS_ROOT, dir);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
}

/**
 * Moves a file from multer's temp directory to its final destination.
 * Returns the relative path stored in the database.
 *
 * @param {string} tmpPath   - Absolute path to the temp file (req.file.path)
 * @param {string} destDir   - Subdirectory inside uploads/ (e.g. 'resumes')
 * @param {string} filename  - Final filename (UUID.ext)
 * @returns {string}         - Relative path: uploads/resumes/UUID.ext
 */
const saveFile = (tmpPath, destDir, filename) => {
  const finalDir = path.join(UPLOADS_ROOT, destDir);

  if (!fs.existsSync(finalDir)) {
    fs.mkdirSync(finalDir, { recursive: true });
  }

  const finalPath = path.join(finalDir, filename);
  fs.renameSync(tmpPath, finalPath);

  // Store forward-slash relative paths regardless of OS
  return `uploads/${destDir}/${filename}`.replace(/\\/g, '/');
};

/**
 * Writes an in-memory buffer directly to its final destination — for content
 * produced programmatically (e.g. a generated resume PDF) rather than
 * uploaded via multer, so there's no temp file to move.
 *
 * @param {Buffer} buffer
 * @param {string} destDir   - Subdirectory inside uploads/ (e.g. 'resumes')
 * @param {string} filename  - Final filename (UUID.ext)
 * @returns {string}         - Relative path: uploads/resumes/UUID.ext
 */
const saveBuffer = (buffer, destDir, filename) => {
  const finalDir = path.join(UPLOADS_ROOT, destDir);

  if (!fs.existsSync(finalDir)) {
    fs.mkdirSync(finalDir, { recursive: true });
  }

  const finalPath = path.join(finalDir, filename);
  fs.writeFileSync(finalPath, buffer);

  return `uploads/${destDir}/${filename}`.replace(/\\/g, '/');
};

/**
 * Deletes a file given its relative path (as stored in the DB).
 * Silently succeeds if the file does not exist.
 *
 * @param {string} relativePath - e.g. 'uploads/resumes/UUID.pdf'
 */
const deleteFile = (relativePath) => {
  if (!relativePath) return;
  const abs = path.join(__dirname, '..', relativePath);
  if (fs.existsSync(abs)) {
    fs.unlinkSync(abs);
  }
};

/**
 * @param {string} relativePath
 * @returns {boolean}
 */
const fileExists = (relativePath) => {
  if (!relativePath) return false;
  const abs = path.join(__dirname, '..', relativePath);
  return fs.existsSync(abs);
};

module.exports = { saveFile, saveBuffer, deleteFile, fileExists, UPLOADS_ROOT };
