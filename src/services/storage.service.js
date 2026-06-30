'use strict';

const fs = require('fs');
const path = require('path');

// Base uploads directory — relative to project root
const UPLOADS_ROOT = path.join(__dirname, '..', '..', 'uploads');

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
 * Deletes a file given its relative path (as stored in the DB).
 * Silently succeeds if the file does not exist.
 *
 * @param {string} relativePath - e.g. 'uploads/resumes/UUID.pdf'
 */
const deleteFile = (relativePath) => {
  if (!relativePath) return;
  const abs = path.join(__dirname, '..', '..', relativePath);
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
  const abs = path.join(__dirname, '..', '..', relativePath);
  return fs.existsSync(abs);
};

module.exports = { saveFile, deleteFile, fileExists, UPLOADS_ROOT };
