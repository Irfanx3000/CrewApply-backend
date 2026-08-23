'use strict';

// Vector icons for the PDF renderer, as inline SVG paths.
//
// An IDM IconText block carries an icon NAME, never markup or a file path —
// so the vocabulary stays renderer-agnostic (a future HTML renderer would map
// the same names to its own icon set, an ATS-plain-text renderer would drop
// them entirely). This module is the PDF renderer's answer to those names.
//
// SVG rather than an icon font because no icon font is embedded server-side
// (fonts.js registers Roboto only, from pdfmake's own package), and rather
// than hand-drawn pdfmake canvas primitives because these shapes need curves.
// pdfmake 0.3 renders `{ svg }` nodes natively — verified on this version.
//
// Paths are 24x24 viewBox, single-colour, and drawn with `currentColor`
// substituted at build time so one definition serves every palette region.

const PATHS = {
  phone:
    'M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .7-.2 1l-2.3 2.2z',
  email:
    'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
  location:
    'M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z',
  globe:
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.9a15.6 15.6 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8zM12 4c.8 1.2 1.4 2.5 1.8 4h-3.6c.4-1.5 1-2.8 1.8-4zM4.3 14a8 8 0 0 1 0-4h3.3a16.5 16.5 0 0 0 0 4H4.3zm.8 2h2.9c.3 1.3.8 2.5 1.4 3.6A8 8 0 0 1 5.1 16zm2.9-8H5.1a8 8 0 0 1 4.3-3.6A15.6 15.6 0 0 0 8 8zM12 20c-.8-1.2-1.4-2.5-1.8-4h3.6c-.4 1.5-1 2.8-1.8 4zm2.2-6H9.8a14.6 14.6 0 0 1 0-4h4.4a14.6 14.6 0 0 1 0 4zm.4 5.6c.6-1.1 1.1-2.3 1.4-3.6h2.9a8 8 0 0 1-4.3 3.6zm1.8-5.6a16.5 16.5 0 0 0 0-4h3.3a8 8 0 0 1 0 4h-3.3z',
  calendar:
    'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10z',

  // ── Section-heading glyphs ──────────────────────────────────────────────
  // Added for the badge-headed templates, where every section title carries a
  // small icon. Same 24x24 viewBox and single-path, single-colour rule as the
  // contact glyphs above, so they work identically inside a badge, inline, or
  // in any future renderer that maps these names to its own set.
  person:
    'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4 0-9 2-9 5v3h18v-3c0-3-5-5-9-5z',
  briefcase:
    'M10 2h4a2 2 0 0 1 2 2v2h4a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4V4a2 2 0 0 1 2-2zm0 4h4V4h-4v2z',
  education:
    'M12 3 1 9l11 6 9-4.9V17h2V9L12 3zM5 13.2V17c0 1.7 3.1 3 7 3s7-1.3 7-3v-3.8l-7 3.8-7-3.8z',
  skills:
    'M22 6.9 20.1 5 12 13.1 8.9 10l6-6L13 2.1a5 5 0 0 0-6.8 6.6L2.1 12.8a1 1 0 0 0 0 1.4l1.4 1.4 2.1-2.1 1.4 1.4-2.1 2.1 2.1 2.1 2.1-2.1 1.4 1.4-2.1 2.1 1.4 1.4a1 1 0 0 0 1.4 0l4.1-4.1a5 5 0 0 0 6.6-6.8z',
  language:
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM4.3 14a8 8 0 0 1 0-4h3.3a16.5 16.5 0 0 0 0 4H4.3zM12 4c.8 1.2 1.4 2.5 1.8 4h-3.6c.4-1.5 1-2.8 1.8-4zm0 16c-.8-1.2-1.4-2.5-1.8-4h3.6c-.4 1.5-1 2.8-1.8 4zm2.2-6H9.8a14.6 14.6 0 0 1 0-4h4.4a14.6 14.6 0 0 1 0 4zm2.2 0a16.5 16.5 0 0 0 0-4h3.3a8 8 0 0 1 0 4h-3.3z',
  hobbies:
    'M12 21s-8-4.9-8-10.4A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 3.6C20 16.1 12 21 12 21z',
  references:
    'M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 13c-3 0-6 1.5-6 4v3h12v-3c0-2.5-3-4-6-4zm8 0c-.7 0-1.4.1-2 .2 1.2 1 2 2.3 2 3.8v3h6v-3c0-2.5-3-4-6-4z',
  certificate:
    'M12 2 4 5.5v6c0 4.6 3.4 8.9 8 10 4.6-1.1 8-5.4 8-10v-6L12 2zm-1.2 13.5-3.3-3.3 1.4-1.4 1.9 1.9 4.9-4.9 1.4 1.4-6.3 6.3z',
  ship:
    'M12 2 9 6h6l-3-4zM5 9l7-2 7 2v3l-7-2-7 2V9zm-2 6 1.5 5c.2.6.7 1 1.4 1h12.2c.7 0 1.2-.4 1.4-1L21 15l-9 2.5L3 15z',
  web:
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 17.9V18a2 2 0 0 0-2-2v-2a2 2 0 0 0 2-2h2a2 2 0 0 0 2-2 8 8 0 0 1-4 9.9zM6.3 16.6A8 8 0 0 1 4 12c0-.6.1-1.2.2-1.7L8 14v1a2 2 0 0 0 2 2v2.9a8 8 0 0 1-3.7-3.3z',
};

/**
 * @param {string} name  key of PATHS
 * @param {string} color any CSS colour string
 * @param {number} size  rendered width/height in pt
 * @returns {object|null} a pdfmake `svg` node, or null for an unknown name —
 *   never throws, because a missing glyph must not take the whole resume down.
 */
function iconNode(name, color, size = 9) {
  const d = PATHS[name];
  if (!d) return null;
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${d}" fill="${color}"/></svg>`,
    width: size,
    height: size,
  };
}

const hasIcon = (name) => Object.prototype.hasOwnProperty.call(PATHS, name);

module.exports = { iconNode, hasIcon, ICON_NAMES: Object.keys(PATHS) };
