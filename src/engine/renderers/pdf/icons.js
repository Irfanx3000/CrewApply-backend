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
