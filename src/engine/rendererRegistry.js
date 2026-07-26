'use strict';

const pdfRenderer = require('./renderers/pdf/pdfRenderer');

// format string -> renderer module exposing render(documentModel) -> Buffer|string.
// Adding DOCX/HTML/ATS-text later means adding an entry here (each walking
// the same IDM) — nothing else in the engine or composer changes.
const RENDERERS = {
  pdf: pdfRenderer,
};

const get = (format) => {
  const renderer = RENDERERS[format];
  if (!renderer) {
    throw new Error(`No renderer registered for format "${format}".`);
  }
  return renderer;
};

module.exports = { get };
