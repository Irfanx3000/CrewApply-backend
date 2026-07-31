'use strict';

// Seeds the initial resume template catalogue so the Career Profile
// Engine's template gallery isn't empty on first deploy. Re-runnable
// (upsert by key). Admins can add more later via
// POST /api/v1/admin/resume-templates — no app release required.
//
//   node src/scripts/seedResumeTemplates.js

require('dotenv').config();
const mongoose = require('mongoose');
const ResumeTemplate = require('../models/resumeTemplate.model');

const COMMON_SECTION_ORDER = ['personal', 'contact', 'maritime', 'experience', 'education', 'certificates', 'skills', 'languages', 'references'];

const TEMPLATES = [
  {
    key: 'maritime-classic',
    name: 'Maritime Classic',
    description: 'Traditional layout emphasizing rank, vessel experience, and certifications — built for seafarer CVs.',
    category: 'maritime',
    sortOrder: 10,
    layout: {
      page: { size: 'A4', margins: { top: 40, right: 40, bottom: 40, left: 40 }, columns: 1 },
      typography: { fontFamily: 'Roboto', baseFontSize: 10, headingScale: 1.4, lineHeight: 1.3, sectionTitleCase: 'title' },
      colors: { primary: '#0D3E85', secondary: '#056DEC', text: '#1E1E1E', muted: '#556172', divider: '#D9D9D9', background: '#FFFFFF' },
      spacing: { sectionGap: 16, itemGap: 8, blockPadding: 4 },
      header: { style: 'centered', showPhoto: false, photoShape: 'circle' },
      divider: { style: 'line', thickness: 1, color: '#D9D9D9' },
      sectionOrder: COMMON_SECTION_ORDER,
      sectionLayouts: {
        experience: { display: 'timeline', dateFormat: 'MMM YYYY' },
        certificates: { display: 'table', showExpiry: true },
        skills: { display: 'list' },
      },
      visibilityRules: { personal: { photo: false, summary: true }, maritime: true, references: false },
    },
  },
  {
    key: 'general-professional',
    name: 'General Professional',
    description: 'Clean, compact layout with a left-aligned header — suitable for any role.',
    category: 'general',
    sortOrder: 20,
    layout: {
      page: { size: 'A4', margins: { top: 40, right: 40, bottom: 40, left: 40 }, columns: 1 },
      typography: { fontFamily: 'Roboto', baseFontSize: 10, headingScale: 1.3, lineHeight: 1.3, sectionTitleCase: 'title' },
      colors: { primary: '#1E1E1E', secondary: '#556172', text: '#1E1E1E', muted: '#727272', divider: '#B9C0CC', background: '#FFFFFF' },
      spacing: { sectionGap: 12, itemGap: 6, blockPadding: 3 },
      header: { style: 'left', showPhoto: false, photoShape: 'square' },
      divider: { style: 'dots', thickness: 1, color: '#B9C0CC' },
      sectionOrder: COMMON_SECTION_ORDER,
      sectionLayouts: {
        experience: { display: 'timeline', dateFormat: 'MMM YYYY' },
        certificates: { display: 'list', showExpiry: false },
        skills: { display: 'list' },
      },
      visibilityRules: { personal: { photo: false, summary: true }, maritime: true, references: false },
    },
  },
  {
    key: 'executive-minimal',
    name: 'Executive Minimal',
    description: 'Sparse, high-signal layout for senior ranks — a bold banner header, uppercase section titles, generous whitespace.',
    category: 'executive',
    sortOrder: 30,
    layout: {
      page: { size: 'A4', margins: { top: 50, right: 50, bottom: 50, left: 50 }, columns: 1 },
      typography: { fontFamily: 'Roboto', baseFontSize: 10, headingScale: 1.2, lineHeight: 1.4, sectionTitleCase: 'upper' },
      colors: { primary: '#000000', secondary: '#404040', text: '#1E1E1E', muted: '#727272', divider: '#BFBFBF', background: '#FFFFFF' },
      spacing: { sectionGap: 22, itemGap: 10, blockPadding: 6 },
      header: { style: 'banner', showPhoto: false, photoShape: 'circle' },
      divider: { style: 'none', thickness: 1, color: '#BFBFBF' },
      sectionOrder: COMMON_SECTION_ORDER,
      sectionLayouts: {
        experience: { display: 'timeline', dateFormat: 'MMM YYYY' },
        certificates: { display: 'table', showExpiry: true },
        skills: { display: 'list' },
      },
      visibilityRules: { personal: { photo: false, summary: true }, maritime: true, references: true },
    },
  },
];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  let n = 0;
  for (const template of TEMPLATES) {
    await ResumeTemplate.findOneAndUpdate(
      { key: template.key },
      { $set: { ...template, isActive: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    n += 1;
    console.log(`  ✓ ${template.name} (${template.key})`);
  }
  console.log(`Seeded/updated ${n} resume templates.`);
  await mongoose.disconnect();
})().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
