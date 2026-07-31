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
      },
      colors: {
        primary: { type: String, default: '#0D3E85' },
        secondary: { type: String, default: '#056DEC' },
        text: { type: String, default: '#1E1E1E' },
        muted: { type: String, default: '#556172' },
        divider: { type: String, default: '#D9D9D9' },
        background: { type: String, default: '#FFFFFF' },
      },
      spacing: {
        sectionGap: { type: Number, default: 16 },
        itemGap: { type: Number, default: 8 },
        blockPadding: { type: Number, default: 4 },
      },
      header: {
        style: { type: String, enum: { values: HEADER_STYLES, message: 'Invalid header style.' }, default: 'centered' },
        showPhoto: { type: Boolean, default: false },
        photoShape: { type: String, enum: ['circle', 'square'], default: 'circle' },
      },
      divider: {
        style: { type: String, enum: { values: DIVIDER_STYLES, message: 'Invalid divider style.' }, default: 'line' },
        thickness: { type: Number, default: 1 },
        color: { type: String, default: '#D9D9D9' },
      },
      // Section keys, e.g. ['personal','maritime','experience','education','certificates','skills','languages','references']
      sectionOrder: { type: [String], default: [] },
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
