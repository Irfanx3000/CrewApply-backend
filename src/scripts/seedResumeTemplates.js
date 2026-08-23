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
  // ── Added templates ────────────────────────────────────────────────────────
  // Authored from supplied designs. Each is config only — no template ships
  // code — and each uses capabilities added alongside it (the banner band,
  // section-heading glyphs, rating bars). New `key`s, so the upsert below
  // cannot touch the four templates above.
  {
    key: 'charcoal-badge',
    name: 'Charcoal Badge',
    description: 'Dark right-hand column with badge-headed sections and rated skill bars — a bold, modern one-page CV.',
    category: 'general',
    sortOrder: 40,
    layout: {
      page: {
        size: 'A4',
        margins: { top: 0, right: 0, bottom: 28, left: 0 },
        columns: 2,
        // The dark column runs the full height on the RIGHT, with the identity
        // block sitting at its top — the mirror of maritime-sidebar.
        sidebar: { enabled: true, widthRatio: 0.38, side: 'right', color: '#3A3A3A' },
        // The light grey panel across the top — the defining element of this
        // design. Painted AFTER the sidebar (see pageBands ordering), so it
        // covers the dark band's upper section and the charcoal column appears
        // to begin below it, exactly as in the source.
        banner: { enabled: true, heightRatio: 0.215, span: 'full', color: '#E4E4E4' },
      },
      typography: {
        fontFamily: 'Roboto',
        baseFontSize: 9,
        headingScale: 1.55,
        lineHeight: 1.35,
        sectionTitleCase: 'upper',
        nameScale: 1.9,
        nameLetterSpacing: 0.8,
        sectionTitleLetterSpacing: 0.6,
        paragraphAlign: 'justify',
      },
      colors: {
        primary: '#2B2B2B', secondary: '#6B6B6B', text: '#3D3D3D',
        muted: '#8A8A8A', divider: '#D2D2D2', background: '#FFFFFF',
        sidebarText: '#FFFFFF', sidebarMuted: '#C9C9C9',
        sidebarAccent: '#FFFFFF', sidebarDivider: '#5A5A5A',
        // The banner band is LIGHT here, so its palette is dark-on-light —
        // the inverse of the usual coloured-band case, and the reason these
        // are separate tokens rather than derived from the sidebar.
        bannerText: '#2B2B2B', bannerMuted: '#6E6E6E', bannerAccent: '#3A3A3A',
      },
      // Ordinary top padding, NOT the banner height. The banner header block
      // sits in the content flow and already reserves the full band height
      // through its own bottom margin, so the columns start below the panel on
      // their own — adding the band height here again pushed every section a
      // second panel's worth down the page.
      spacing: { sectionGap: 15, itemGap: 7, blockPadding: 3, columnPadding: 26, columnPaddingTop: 18 },
      header: {
        style: 'centered', showPhoto: true, photoShape: 'circle', photoSize: 104,
        photoRingWidth: 4, photoRingColor: '#FFFFFF',
        // Identity lives in the grey panel, hard right, with the photo beside
        // it over the charcoal column — the arrangement in the source design.
        placement: 'banner', photoSide: 'right', bannerAlign: 'right',
        nameLayout: 'single', showContactLine: false,
      },
      sectionTitle: { variant: 'plain', sidebarSizeScale: 0.8, iconBadge: true, iconBadgeColor: '#3A3A3A' },
      divider: { style: 'none', thickness: 0, color: '#D2D2D2' },
      sectionOrder: [],
      sectionTitles: { summary: 'About Me', experience: 'Job Experience', contact: 'Contact Me', languages: 'Language' },
      sectionIcons: {
        summary: 'person', experience: 'briefcase', skills: 'skills', languages: 'language',
        contact: 'phone', education: 'education', references: 'references', certificates: 'certificate',
        maritime: 'ship',
      },
      columns: {
        left: ['summary', 'experience', 'skills', 'languages'],
        right: ['contact', 'education', 'references'],
        leftRatio: 0.62,
      },
      sectionLayouts: {
        experience: { display: 'timeline', dateFormat: 'YYYY' },
        // The design shows segmented skill meters in two columns.
        skills: { display: 'rating', barStyle: 'segmented', columns: 2 },
        languages: { display: 'labelValue', rowLayout: 'inline', bulletStyle: 'circle' },
        certificates: { display: 'list', showExpiry: true },
      },
      visibilityRules: { personal: { photo: true, summary: true }, maritime: false, references: true },
    },
  },
  {
    key: 'azure-banner',
    name: 'Azure Banner',
    description: 'Blue header band with photo and contact details, a full-width profile, then a two-column body.',
    category: 'general',
    sortOrder: 50,
    layout: {
      page: {
        size: 'A4',
        margins: { top: 0, right: 0, bottom: 28, left: 0 },
        columns: 2,
        sidebar: { enabled: false, widthRatio: 0.35, side: 'left', color: '#FFFFFF' },
        banner: { enabled: true, heightRatio: 0.205, span: 'full', color: '#1668C4' },
      },
      typography: {
        fontFamily: 'Roboto',
        baseFontSize: 9.5,
        headingScale: 1.35,
        lineHeight: 1.35,
        sectionTitleCase: 'upper',
        nameScale: 1.72,
        nameLetterSpacing: 0.3,
        sectionTitleLetterSpacing: 0.8,
        paragraphAlign: 'justify',
      },
      colors: {
        primary: '#1668C4', secondary: '#1668C4', text: '#333333',
        muted: '#6B7280', divider: '#1668C4', background: '#FFFFFF',
        bannerText: '#FFFFFF', bannerMuted: '#D3E4F7', bannerAccent: '#FFFFFF',
      },
      spacing: { sectionGap: 13, itemGap: 6, blockPadding: 3, columnPadding: 30, columnPaddingTop: 16 },
      header: {
        style: 'left', showPhoto: true, photoShape: 'circle',
        // Large and centred, as in the source design: the photo is the focal
        // point of the band, not an accessory beside the name.
        photoSize: 122, photoRingWidth: 4, photoRingColor: '#FFFFFF',
        placement: 'banner', photoSide: 'center', contactInBanner: true,
        // Given name light on line one, FAMILY NAME heavy on line two, with
        // the role in a filled block beneath.
        nameLayout: 'stacked', headlineBadge: true, headlineBadgeColor: '#0F4F9E',
        showContactLine: false,
      },
      sectionTitle: { variant: 'underline', sidebarSizeScale: 0.9, iconBadge: false },
      divider: { style: 'none', thickness: 0, color: '#1668C4' },
      sectionOrder: [],
      sectionTitles: { summary: 'Profile Summary', experience: 'Professional Experience', contact: 'Social' },
      sectionIcons: {},
      columns: {
        left: ['contact', 'skills', 'education'],
        right: ['summary', 'experience', 'certificates'],
        leftRatio: 0.34,
      },
      sectionLayouts: {
        experience: { display: 'timeline', dateFormat: 'MMM YYYY' },
        skills: { display: 'list', bulletStyle: 'check' },
        certificates: { display: 'list', showExpiry: true },
        languages: { display: 'labelValue', rowLayout: 'inline' },
      },
      visibilityRules: { personal: { photo: true, summary: true }, maritime: true, references: false },
    },
  },
  {
    key: 'forest-banner',
    name: 'Forest Banner',
    description: 'Deep green header band with a circular photo and wide-set name, over a calm two-column body.',
    category: 'executive',
    sortOrder: 60,
    layout: {
      page: {
        size: 'A4',
        margins: { top: 0, right: 0, bottom: 28, left: 0 },
        columns: 2,
        // Light grey reading column on the left. A band does not have to be
        // dark — the watermark reads its luminance and keeps dark tiles here.
        sidebar: { enabled: true, widthRatio: 0.33, side: 'left', color: '#EFEFEF' },
        banner: { enabled: true, heightRatio: 0.185, span: 'full', color: '#1F4B3F' },
      },
      typography: {
        fontFamily: 'Roboto',
        baseFontSize: 9,
        headingScale: 1.35,
        lineHeight: 1.4,
        sectionTitleCase: 'upper',
        nameScale: 2.1,
        nameLetterSpacing: 2.2,
        sectionTitleLetterSpacing: 1.6,
        paragraphAlign: 'justify',
      },
      colors: {
        primary: '#1F4B3F', secondary: '#3D6B5E', text: '#3A3A3A',
        muted: '#7A7A7A', divider: '#B7B7B7', background: '#FFFFFF',
        // The left band is light, so its palette stays dark-on-light.
        sidebarText: '#3A3A3A', sidebarMuted: '#7A7A7A',
        sidebarAccent: '#1F4B3F', sidebarDivider: '#C4C4C4',
        bannerText: '#FFFFFF', bannerMuted: '#BFD6CE', bannerAccent: '#FFFFFF',
      },
      spacing: { sectionGap: 16, itemGap: 7, blockPadding: 3, columnPadding: 26, columnPaddingTop: 20 },
      header: {
        style: 'left', showPhoto: true, photoShape: 'circle', photoSize: 96,
        photoRingWidth: 3, photoRingColor: '#FFFFFF',
        placement: 'banner', photoSide: 'left', contactInBanner: false,
        showContactLine: false,
      },
      sectionTitle: { variant: 'underline', sidebarSizeScale: 0.95, iconBadge: false },
      divider: { style: 'none', thickness: 0, color: '#B7B7B7' },
      sectionOrder: [],
      sectionTitles: { summary: 'About', experience: 'Experience', skills: 'Skills', education: 'Education' },
      sectionIcons: {},
      columns: {
        left: ['contact', 'skills', 'education', 'languages'],
        right: ['summary', 'experience', 'certificates'],
        leftRatio: 0.33,
      },
      sectionLayouts: {
        experience: { display: 'timeline', dateFormat: 'YYYY' },
        skills: { display: 'list', bulletStyle: 'dot' },
        languages: { display: 'labelValue', rowLayout: 'stacked' },
        certificates: { display: 'list', showExpiry: true },
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
