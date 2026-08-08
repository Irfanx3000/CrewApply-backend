'use strict';

// The Intermediate Document Model (IDM) — a closed, versioned vocabulary of
// block types. A template arranges/styles these blocks; it cannot invent new
// ones. Adding a genuinely new block type is a deliberate, cross-renderer
// architecture change, not a template-author choice — that's what keeps
// every format renderer (PDF today, DOCX/HTML/ATS-text later) finite and
// maintainable. Pure data shapes only — no rendering logic lives here.

const BLOCK_TYPES = Object.freeze({
  HEADER: 'Header',
  SECTION: 'Section',
  PARAGRAPH: 'Paragraph',
  TIMELINE: 'Timeline',
  TIMELINE_ITEM: 'TimelineItem',
  BULLET_LIST: 'BulletList',
  TABLE: 'Table',
  COLUMNS: 'Columns',
  DIVIDER: 'Divider',
  IMAGE: 'Image',
  FOOTER: 'Footer',
  PAGE_BREAK: 'PageBreak',
  // An icon paired with a line of text — contact rows ("phone glyph +
  // +91 12345"), and anything else where the glyph carries the label so the
  // text doesn't have to. Added for the sidebar template; deliberately generic
  // (icon is a NAME from the renderer's icon set, never markup or a file path)
  // so every renderer can decide how to draw it — SVG in PDF, a real character
  // in HTML, dropped entirely in ATS-plain-text.
  ICON_TEXT: 'IconText',
  // Rows of "label: value" pairs — Languages (English / Proficient), Maritime
  // Profile (Rank / Second Officer). Distinct from BulletList because the two
  // halves are styled and aligned independently, and from Table because it
  // carries no header row or borders.
  LABEL_VALUE_LIST: 'LabelValueList',
});

// Palette regions. A block tree is painted against ONE palette at a time;
// a Columns block can hand a different region to each of its columns, which
// is what lets a dark sidebar and a white main column coexist in one document
// without any block needing to carry its own colours.
const REGIONS = Object.freeze({
  MAIN: 'main',
  SIDEBAR: 'sidebar',
});

/** @returns {{type: string, props: object, children: object[]}} */
const block = (type, props = {}, children = []) => ({ type, props, children });

module.exports = { BLOCK_TYPES, REGIONS, block };
