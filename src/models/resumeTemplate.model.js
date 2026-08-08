'use strict';

const mongoose = require('mongoose');

// Admin-manageable presentation config for a resume — NOT html, NOT a React
// Native component. Purely typography/spacing/layout/section-order/visibility
// data that the rendering engine's Document Composer interprets. New
// templates ship by creating a document here (via the admin panel), never by
// an app release. Mirrors the JobTaxonomy/DocumentType admin-collection shape.

const PAGE_SIZES = Object.freeze(['A4', 'Letter']);
const TEMPLATE_CATEGORIES = Object.freeze(['general', 'maritime', 'executive', 'minimal']);
const HEADER_STYLES = Object.freeze(['centered', 'left', 'banner']);
const DIVIDER_STYLES = Object.freeze(['line', 'dots', 'none']);
const PHOTO_SHAPES = Object.freeze(['circle', 'square']);
const TEXT_ALIGNMENTS = Object.freeze(['left', 'center', 'right', 'justify']);
const SECTION_TITLE_VARIANTS = Object.freeze(['plain', 'underline']);

const resumeTemplateSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, 'Key is required.'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z][a-z0-9-]{1,49}$/, 'Key must be lowercase letters, numbers, or hyphens, starting with a letter.'],
      immutable: true,
    },

    name: { type: String, required: [true, 'Name is required.'], trim: true, maxlength: 100 },
    description: { type: String, trim: true, default: '', maxlength: 300 },
    thumbnailUrl: { type: String, default: null },

    category: {
      type: String,
      enum: { values: TEMPLATE_CATEGORIES, message: 'Invalid template category.' },
      default: 'general',
    },

    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },

    // Presentation config only — the closed IDM Block vocabulary (see
    // engine/blocks.js) is what the composer/renderers actually understand;
    // this just parameterizes how those blocks get arranged and styled.
    layout: {
      page: {
        size: { type: String, enum: { values: PAGE_SIZES, message: 'Invalid page size.' }, default: 'A4' },
        margins: {
          top: { type: Number, default: 40 },
          right: { type: Number, default: 40 },
          bottom: { type: Number, default: 40 },
          left: { type: Number, default: 40 },
        },
        columns: { type: Number, enum: [1, 2], default: 1 },

        // ── Sidebar band ────────────────────────────────────────────────────
        // A full-bleed coloured strip down one edge, painted as a PAGE
        // decoration rather than a block: it must cover the entire page height
        // and repeat on every page, which no block in a flowing document can
        // guarantee. Disabled by default, so every existing template renders
        // byte-for-byte as before.
        //
        // MUST stay nested under `page` — the builder, the PDF renderer and
        // the mobile thumbnail all read `layout.page.sidebar`. Declared one
        // level up, Mongoose silently drops it on save and the band vanishes
        // everywhere at once.
        sidebar: {
          enabled: { type: Boolean, default: false },
          // Fraction of page width, 0-1. The column widths in `columns` below
          // must agree with this — the band is paint, the columns are layout.
          widthRatio: { type: Number, default: 0.35, min: 0.2, max: 0.5 },
          side: { type: String, enum: ['left', 'right'], default: 'left' },
          color: { type: String, default: '#2B303B' },
        },
      },

      typography: {
        fontFamily: { type: String, default: 'Roboto' },
        baseFontSize: { type: Number, default: 10 },
        headingScale: { type: Number, default: 1.4 },
        lineHeight: { type: Number, default: 1.3 },
        // 'upper' uppercases section titles (e.g. "EXPERIENCE") at paint
        // time — a font-free way to give a template a distinct voice, since
        // pdfmake only has Roboto registered (see engine/renderers/pdf/fonts.js).
        sectionTitleCase: { type: String, enum: { values: ['title', 'upper'], message: 'Invalid section title case.' }, default: 'title' },
        // Extra tracking (pt) on the name and on section titles. Reproduces
        // the airy, wide-set caps of display-font designs using the one font
        // that is actually embedded.
        // Name size as a multiple of (baseFontSize x headingScale). Was a
        // hardcoded 1.3 in the PDF renderer's style table; templates that lead
        // with a large display name need it larger.
        nameScale: { type: Number, default: 1.3 },
        nameLetterSpacing: { type: Number, default: 0 },
        sectionTitleLetterSpacing: { type: Number, default: 0 },
        // Body copy alignment — 'justify' gives the flush-both-edges block
        // that most designed résumés use for the profile paragraph.
        paragraphAlign: { type: String, enum: { values: TEXT_ALIGNMENTS, message: 'Invalid paragraph alignment.' }, default: 'left' },
      },
      colors: {
        primary: { type: String, default: '#0D3E85' },
        secondary: { type: String, default: '#056DEC' },
        text: { type: String, default: '#1E1E1E' },
        muted: { type: String, default: '#556172' },
        divider: { type: String, default: '#D9D9D9' },
        background: { type: String, default: '#FFFFFF' },
        // Palette used for anything painted inside the sidebar band. Ignored
        // unless page.sidebar.enabled — a block never carries its own colours,
        // it inherits whichever region it is painted in (see engine/blocks.js).
        sidebarText: { type: String, default: '#FFFFFF' },
        sidebarMuted: { type: String, default: '#B9C0CC' },
        sidebarAccent: { type: String, default: '#4A90E2' },
        sidebarDivider: { type: String, default: '#4A5160' },
      },
      spacing: {
        sectionGap: { type: Number, default: 16 },
        itemGap: { type: Number, default: 8 },
        blockPadding: { type: Number, default: 4 },
        // Inner padding of each column when a two-column layout is in use.
        columnPadding: { type: Number, default: 24 },
        // Top padding of each column, when it should differ from the sides —
        // a full-bleed sidebar usually wants noticeably more air above the
        // photo than it does at its left edge. Falls back to columnPadding.
        columnPaddingTop: { type: Number, default: null },
      },
      header: {
        style: { type: String, enum: { values: HEADER_STYLES, message: 'Invalid header style.' }, default: 'centered' },
        showPhoto: { type: Boolean, default: false },
        photoShape: { type: String, enum: { values: PHOTO_SHAPES, message: 'Invalid photo shape.' }, default: 'circle' },
        photoSize: { type: Number, default: 60 },
        // Thin ring drawn around the photo. 0 = none.
        photoRingWidth: { type: Number, default: 0 },
        photoRingColor: { type: String, default: '#FFFFFF' },
        // Where the name/photo/headline block lives. 'document' = across the
        // top of the page (every template before this one). 'sidebar' = at the
        // top of the sidebar column instead.
        placement: { type: String, enum: { values: ['document', 'sidebar'], message: 'Invalid header placement.' }, default: 'document' },
        // The one-line "email • phone • city" strip under the name. Templates
        // that give Contact its own section turn this off to avoid printing
        // the same details twice.
        showContactLine: { type: Boolean, default: true },
      },
      sectionTitle: {
        variant: { type: String, enum: { values: SECTION_TITLE_VARIANTS, message: 'Invalid section title variant.' }, default: 'plain' },
        // Scale relative to headingScale, so a template can have big page
        // headings and small sidebar headings without a second font size.
        sidebarSizeScale: { type: Number, default: 0.85 },
      },
      divider: {
        style: { type: String, enum: { values: DIVIDER_STYLES, message: 'Invalid divider style.' }, default: 'line' },
        thickness: { type: Number, default: 1 },
        color: { type: String, default: '#D9D9D9' },
      },
      // Section keys, e.g. ['personal','maritime','experience','education','certificates','skills','languages','references']
      sectionOrder: { type: [String], default: [] },
      // Optional per-section title overrides, e.g. { summary: 'Profile' } —
      // "Profile" vs "About Me" vs "Career Objective" is a design decision,
      // so it lives in the template rather than in the builder.
      sectionTitles: { type: mongoose.Schema.Types.Mixed, default: {} },
      // Two-column layouts only: which sections go in which column, and in
      // what order. When `left` is non-empty the builder switches to the
      // two-column path and `sectionOrder` is ignored. Same section keys.
      columns: {
        left: { type: [String], default: [] },
        right: { type: [String], default: [] },
        // Left column width as a fraction of the content width. Normally
        // matches page.sidebar.widthRatio so the band and the column align.
        leftRatio: { type: Number, default: 0.35, min: 0.2, max: 0.5 },
      },
      // Per-section display hints (e.g. { experience: { display: 'timeline' } }) —
      // kept flexible/Mixed since shape varies per section, same reasoning as
      // CareerProfile.customSections.content.
      sectionLayouts: { type: mongoose.Schema.Types.Mixed, default: {} },
      visibilityRules: { type: mongoose.Schema.Types.Mixed, default: {} },
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

resumeTemplateSchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('ResumeTemplate', resumeTemplateSchema);
module.exports.PAGE_SIZES = PAGE_SIZES;
module.exports.TEMPLATE_CATEGORIES = TEMPLATE_CATEGORIES;
module.exports.HEADER_STYLES = HEADER_STYLES;
module.exports.DIVIDER_STYLES = DIVIDER_STYLES;
module.exports.PHOTO_SHAPES = PHOTO_SHAPES;
module.exports.TEXT_ALIGNMENTS = TEXT_ALIGNMENTS;
module.exports.SECTION_TITLE_VARIANTS = SECTION_TITLE_VARIANTS;
