'use strict';

const fs = require('fs');

// Detects a file's REAL format from its magic-byte signature. The client's
// declared Content-Type (multer's `file.mimetype`) and the filename extension
// are both trivially spoofable — e.g. a script renamed to "resume.pdf" with
// Content-Type: application/pdf set by hand — so this is the only trustworthy
// signal for what a file actually is. Only checks the formats this app accepts.
const SIGNATURE_CHECKS = [
  { mime: 'application/pdf', test: (buf) => buf.subarray(0, 5).toString('ascii') === '%PDF-' },
  { mime: 'image/jpeg', test: (buf) => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff },
  { mime: 'image/png', test: (buf) => buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', test: (buf) => buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP' },
];

/**
 * @param {string} filePath - absolute path to a file already saved to disk
 * @returns {string|null} the detected real mime type, or null if it doesn't match any known signature
 */
const detectFileMimeType = (filePath) => {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    const match = SIGNATURE_CHECKS.find(({ test }) => test(buffer));
    return match ? match.mime : null;
  } finally {
    fs.closeSync(fd);
  }
};

module.exports = { detectFileMimeType };
