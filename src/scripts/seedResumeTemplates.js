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
  {
    // Reverse-engineered from the supplied reference design: a full-bleed dark
    // sidebar carrying the photo, identity and the short-form sections, with
    // the narrative sections on white to its right.
    //
    // Proportions taken off the reference: the sidebar edge sits at ~36% of the
    // page width; the photo is ~60% of the sidebar's width; the name is roughly
    // 2x body size and the sidebar's section titles are noticeably smaller than
    // the main column's. Colours sampled from the image: #2B303B ground,
    // #4A90E2 accent on the designation and the contact glyphs.
    key: 'maritime-sidebar',
    name: 'Maritime Sidebar',
    description: 'Dark sidebar with photo, contact and skills; profile, experience and education on white. High-contrast and photo-forward.',
    category: 'maritime',
    sortOrder: 5,
    layout: {
      page: {
        size: 'A4',
        // Ignored while a sidebar is enabled — the band must bleed to the page
        // edges, so padding moves to spacing.columnPadding below.
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        columns: 2,
        sidebar: { enabled: true, widthRatio: 0.36, side: 'left', color: '#2B303B' },
      },
      typography: {
        fontFamily: 'Roboto',
        baseFontSize: 9.5,
        headingScale: 1.5,
        lineHeight: 1.35,
        sectionTitleCase: 'upper',
        nameScale: 1.55,
        nameLetterSpacing: 0.4,
        sectionTitleLetterSpacing: 0.8,
        paragraphAlign: 'justify',
      },
      colors: {
        primary: '#1E1E1E',
        secondary: '#4A90E2',
        text: '#2B303B',
        muted: '#6B7280',
        divider: '#D9D9D9',
        background: '#FFFFFF',
        sidebarText: '#FFFFFF',
        sidebarMuted: '#AEB6C4',
        sidebarAccent: '#4A90E2',
        sidebarDivider: '#4A5160',
      },
      spacing: { sectionGap: 18, itemGap: 8, blockPadding: 4, columnPadding: 26, columnPaddingTop: 42 },
      header: {
        style: 'centered',
        placement: 'sidebar',
        showPhoto: true,
        photoShape: 'circle',
        photoSize: 96,
        photoRingWidth: 3,
        photoRingColor: '#FFFFFF',
        // Contact has its own icon'd section in the sidebar, so the header's
        // one-line strip would just repeat it.
        showContactLine: false,
      },
      sectionTitle: { variant: 'plain', sidebarSizeScale: 0.92 },
      divider: { style: 'none', thickness: 1, color: '#D9D9D9' },
      sectionOrder: COMMON_SECTION_ORDER,
      sectionTitles: { summary: 'Profile' },
      columns: {
        leftRatio: 0.36,
        left: ['contact', 'maritime', 'skills', 'languages'],
        right: ['summary', 'experience', 'education', 'certificates'],
      },
      sectionLayouts: {
        experience: { display: 'timeline', dateAlign: 'right', subtitle: 'full', bulletStyle: 'disc' },
        education: { display: 'stacked' },
        certificates: { display: 'table', showExpiry: true },
        skills: { bulletStyle: 'circle' },
        languages: { display: 'labelValue', rowLayout: 'inline', bulletStyle: 'circle' },
        maritime: { display: 'labelValue', rowLayout: 'stacked' },
      },
      visibilityRules: { personal: { photo: true, summary: true }, maritime: true, references: false },
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
