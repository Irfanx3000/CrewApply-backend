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
});

/** @returns {{type: string, props: object, children: object[]}} */
const block = (type, props = {}, children = []) => ({ type, props, children });

module.exports = { BLOCK_TYPES, block };
