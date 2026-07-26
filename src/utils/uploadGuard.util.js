'use strict';

const fs = require('fs');
const { detectFileMimeType } = require('./fileSignature.util');
const AppError = require('./AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

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

module.exports = { assertRealFileType, deleteTempFile };
