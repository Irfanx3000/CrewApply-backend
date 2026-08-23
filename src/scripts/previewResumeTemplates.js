'use strict';

// Renders every active resume template to a PDF using representative data, so
// a template's real output can be looked at without going through the app.
//
//   node src/scripts/previewResumeTemplates.js            # all active templates
//   node src/scripts/previewResumeTemplates.js azure-banner forest-banner
//
// Output lands in .tplout/ (gitignored). Add --clean to render without the
// free-tier watermark.
//
// Exists because template work is visual: the only way to know a layout is
// right is to look at it, and doing that through the app means a build, a
// login, a profile and a tap for every iteration.

require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const { render } = require('../engine/renderers/pdf/pdfRenderer');
const { buildDocumentModel } = require('../engine/buildDocumentModel');
const ResumeTemplate = require('../models/resumeTemplate.model');

const OUT_DIR = path.join(__dirname, '..', '..', '.tplout');

// resolveImagePath() in the PDF renderer joins against the SRC directory, not
// the repo root, so a preview avatar has to live under src/ to be findable at
// all. Parked in the upload temp folder, which the hourly sweep reclaims on
// its own — nothing to clean up by hand.
const AVATAR_REL = 'uploads/temp/preview-avatar.jpg';
const AVATAR_ABS = path.join(__dirname, '..', AVATAR_REL);

/** Draws a neutral placeholder headshot, so the script needs no fixture file. */
const ensureAvatar = async () => {
  if (fs.existsSync(AVATAR_ABS)) return;
  fs.mkdirSync(path.dirname(AVATAR_ABS), { recursive: true });
  const sharp = require('sharp');
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">'
    + '<rect width="600" height="600" fill="#8FA6B8"/>'
    + '<circle cx="300" cy="235" r="105" fill="#E8D5C4"/>'
    + '<ellipse cx="300" cy="500" rx="175" ry="150" fill="#3E5C76"/></svg>'
  );
  await sharp(svg).jpeg({ quality: 88 }).toFile(AVATAR_ABS);
};

// Deliberately "full" — every section populated, a long summary, multi-line
// entries — because layout bugs hide in the empty case and surface when real
// content has to wrap.
const SAMPLE = {
  personal: {
    fullName: 'Irfan Shaikh',
    // A real image, because photo SIZING cannot be judged from a template
    // rendered without one — and the circular mask runs through sharp, so an
    // absent avatar skips that code path entirely.
    //
    // Relative to the backend root, which is what resolveImagePath() joins
    // against; an absolute path silently resolves to null and the photo simply
    // does not appear, which reads as a template bug rather than bad fixture.
    avatarUrl: AVATAR_REL,
  },
  // The About/Profile section reads this, NOT personal.summary — see
  // buildObjective(). Getting it wrong makes the section silently vanish and
  // look like a template bug when it is only bad sample data.
  careerObjective:
    'Experienced deck officer with over five years of international sailing across bulk carriers and container vessels. '
    + 'Strong background in bridge watchkeeping, cargo planning and stowage, and port state control readiness. '
    + 'Seeking a Chief Officer position with an operator focused on safety culture and crew development.',
  contact: {
    email: 'irfanshaikhx3@gmail.com',
    phone: '+91 72081 20335',
    city: 'Panvel',
    currentLocation: 'Panvel, Maharashtra',
  },
  maritime: { rank: 'Second Officer', department: 'Deck', vesselType: 'Bulk Carrier' },
  experience: [
    {
      role: 'Chief Officer',
      company: 'Maersk Line',
      startDate: '2020-08',
      endDate: null,
      responsibilities: ['Bridge watchkeeping and passage planning', 'Cargo planning, stowage and stability'],
    },
    {
      role: 'Second Officer',
      company: 'Anglo Eastern',
      startDate: '2017-06',
      endDate: '2020-07',
      responsibilities: ['Safety equipment maintenance', 'ECDIS chart corrections'],
    },
  ],
  education: [
    { degree: 'B.E. Mechanical Engineering', institution: 'Anjuman Islam Kalsekar', startDate: '2017-08', endDate: '2020-08' },
  ],
  skills: [
    { name: 'ECDIS Navigation', level: 'Expert' },
    { name: 'Cargo Operations', level: 'Intermediate' },
    { name: 'Bridge Resource Mgmt', level: 'Expert' },
    { name: 'Port State Control', level: 'Beginner' },
  ],
  languages: [
    { name: 'English', proficiency: 'Fluent' },
    { name: 'Hindi', proficiency: 'Native' },
    { name: 'Arabic', proficiency: 'Conversational' },
  ],
  certificates: [
    { name: 'STCW Basic Safety Training', issuer: 'DG Shipping', expiryDate: '2027-06' },
    { name: 'ECDIS Generic Certificate', issuer: 'DG Shipping', expiryDate: '2028-01' },
  ],
  references: [
    { name: 'Capt. R. Menon', company: 'Maersk Line', email: 'menon@example.com', phone: '+91 90000 11111' },
  ],
};

const WATERMARK = {
  text: 'CrewApply',
  footer: 'FREE PREVIEW · Generated with CrewApply · Subscribe to remove this watermark',
  opacity: 0.075,
  angle: -32,
  stepX: 168,
  stepY: 116,
};

(async () => {
  const args = process.argv.slice(2);
  const clean = args.includes('--clean');
  const keys = args.filter((a) => !a.startsWith('--'));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  await ensureAvatar();
  await mongoose.connect(process.env.MONGODB_URI);

  const filter = keys.length ? { key: { $in: keys } } : { isActive: true };
  const templates = await ResumeTemplate.find(filter).sort({ sortOrder: 1 }).lean();

  if (!templates.length) {
    console.log('No templates matched.');
    await mongoose.connection.close();
    return;
  }

  for (const t of templates) {
    const model = buildDocumentModel(SAMPLE, t.layout);
    if (!clean) model.watermark = WATERMARK;
    const buffer = await render(model);
    const file = path.join(OUT_DIR, `${t.key}.pdf`);
    fs.writeFileSync(file, buffer);
    console.log(`  ${t.key.padEnd(24)} ${String(buffer.length).padStart(8)} bytes  -> ${path.relative(process.cwd(), file)}`);
  }

  console.log(`\nRendered ${templates.length} template(s)${clean ? ' (no watermark)' : ''}.`);
  await mongoose.connection.close();
})().catch((e) => {
  console.error('Preview failed:', e.message);
  process.exit(1);
});
