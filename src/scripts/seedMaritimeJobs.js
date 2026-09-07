'use strict';

// Seeds the full Cruise Ships / Merchant Navy role library from the client's
// job-category document as real Job documents, plus the taxonomy entries
// (category / department / vesselType) those jobs reference — otherwise the
// admin Job form's dropdowns can't offer them and job.validation.js rejects
// any edit to a seeded job.
//
// Reuses the taxonomy names seedJobTaxonomy.js/seedJobCategories.js already
// created wherever one fits (Deck, Engine, Catering / Galley, Hotel /
// Hospitality, Medical, Tanker, Cruise, ...) and only adds what is genuinely
// new — the document's "Culinary / Galley" is this project's existing
// "Catering / Galley", its "Hotel / Housekeeping" is "Hotel / Hospitality".
//
// Jobs are created as DRAFTS so nothing appears in the mobile app until an
// admin reviews and publishes it. Re-runnable: upserts by
// {title, department, vesselType} with $setOnInsert only, so a re-run never
// clobbers edits an admin made to an already-seeded job.
//
//   node src/scripts/seedMaritimeJobs.js                # taxonomy + draft jobs
//   node src/scripts/seedMaritimeJobs.js --publish      # create them published
//   node src/scripts/seedMaritimeJobs.js --taxonomy-only
//   node src/scripts/seedMaritimeJobs.js --check        # self-check, no DB

require('dotenv').config();
const assert = require('assert');
const mongoose = require('mongoose');
const Job = require('../models/job.model');
const JobTaxonomy = require('../models/jobTaxonomy.model');
const User = require('../models/user.model');
const { ROLES } = require('../constants/roles');

// Edit these before a real run — the only values a human has to choose;
// everything else is derived from the role.
const COMPANY_NAME = 'CrewApply';
const LOCATION = { country: 'International', city: null };
const REQUIRED_DOCUMENTS = ['resume', 'passport', 'cdc', 'medical', 'stcw'];

// ── 1. CRUISE SHIPS ──────────────────────────────────────────────────────────
// department -> ranks. Department names are the EXISTING taxonomy names
// wherever one already covers the document's heading.
const CRUISE = {
  'Deck': [
    'Captain / Master', 'Staff Captain', 'Chief Officer', '2nd Officer', '3rd Officer',
    'Junior Officer', 'Deck Cadet', 'Bosun', 'Able Seaman (AB)', 'Ordinary Seaman (OS)',
    'Deck Rating', 'Quartermaster', 'Watchman', 'Safety Officer', 'Environmental Officer',
    'Security Officer', 'Security Supervisor', 'Security Guard',
    'Ship Security Officer (SSO)', 'Security Staff',
  ],
  'Engine': [
    'Chief Engineer', '2nd Engineer', '3rd Engineer', '4th Engineer', 'Junior Engineer',
    'Engine Cadet', 'Electrical Engineer', 'Electro-Technical Officer (ETO)',
    'Electro-Technical Rating (ETR)', 'Refrigeration Engineer', 'HVAC Technician',
    'Motorman', 'Oiler', 'Wiper', 'Fitter', 'Welder', 'Plumber', 'Engine Room Rating',
  ],
  'Hotel / Hospitality': [
    'Executive Housekeeper', 'Housekeeping Manager', 'Assistant Housekeeping Manager',
    'Housekeeping Supervisor', 'Cabin Steward', 'Assistant Cabin Steward',
    'Public Area Attendant', 'Laundry Manager', 'Laundry Attendant', 'Linen Keeper',
    'Bellman', 'Stateroom Attendant',
  ],
  'Food & Beverage': [
    'F&B Director', 'Restaurant Manager', 'Assistant Restaurant Manager',
    'Restaurant Supervisor', 'Waiter / Waitress', 'Assistant Waiter', 'Buffet Attendant',
    'Bar Manager', 'Bartender', 'Bar Waiter', 'Sommelier', 'Room Service Attendant',
  ],
  'Catering / Galley': [
    'Executive Chef', 'Executive Sous Chef', 'Sous Chef', 'Chef de Partie', 'Demi Chef',
    'Commis Chef', 'Pastry Chef', 'Baker', 'Butcher', 'Galley Steward', 'Kitchen Utility',
    'Dishwasher',
  ],
  'Guest Services': [
    'Hotel Director', 'Guest Services Manager', 'Guest Services Officer', 'Receptionist',
    'Guest Relations Officer', 'Concierge', 'Shore Excursion Staff', 'Tour Staff',
    'Cruise Staff',
  ],
  'Entertainment': [
    'Cruise Director', 'Assistant Cruise Director', 'Entertainment Manager',
    'Host / Hostess', 'Activities Staff', 'Dancer', 'Singer', 'Musician', 'DJ',
    'Performer', 'Stage Technician', 'Lighting Technician', 'Sound Technician',
    'Production Staff',
  ],
  'Spa / Fitness / Beauty': [
    'Spa Manager', 'Spa Therapist', 'Massage Therapist', 'Beauty Therapist',
    'Hairdresser', 'Barber', 'Fitness Director', 'Fitness Instructor', 'Personal Trainer',
    'Yoga Instructor', 'Sports Instructor', 'Lifeguard',
  ],
  'Medical': ['Ship Doctor', 'Staff Doctor', 'Nurse', 'Medical Assistant', 'Medical Receptionist'],
  'Retail / Casino': [
    'Retail Manager', 'Retail Sales Associate', 'Jewelry Sales Associate', 'Duty-Free Sales',
    'Casino Manager', 'Casino Supervisor', 'Casino Dealer', 'Casino Cashier',
  ],
  'Youth / Family': ['Youth Staff', 'Kids Club Staff', 'Youth Counselor', 'Babysitter / Childcare Staff'],
};

// ── 2. MERCHANT NAVY / COMMERCIAL SHIPS ──────────────────────────────────────
// Every merchant vessel shares the same deck/engine/galley spine; the
// document's per-vessel lists differ only in the cargo-specific extras below.
// The document's vague entries ("Deck Officers", "Ratings") are expanded into
// the concrete ranks they stand for, so the Rank filter stays usable.
const MN_DECK = [
  'Master', 'Chief Officer', '2nd Officer', '3rd Officer', 'Deck Cadet', 'Bosun',
  'Able Seaman (AB)', 'Ordinary Seaman (OS)',
];
const MN_ENGINE = [
  'Chief Engineer', '2nd Engineer', '3rd Engineer', '4th Engineer', 'Engine Cadet',
  'Electro-Technical Officer (ETO)', 'Motorman', 'Oiler', 'Fitter',
];
const MN_GALLEY = ['Cook', 'Steward'];

// vesselType -> extra ranks on top of the spine, per department.
const MERCHANT = {
  'Tanker': { 'Deck': ['Pumpman', 'Cargo Officer'] },
  'Chemical Tanker': {
    'Deck': ['Pumpman', 'Cargo Officer', 'Chemical Tanker Officer'],
    'Engine': ['Cargo Engineer / Operator'],
  },
  'LNG Carrier': {
    'Deck': ['LNG Officer', 'Cargo Officer', 'Pumpman'],
    'Engine': ['Cargo Engineer', 'Gas Engineer', 'Cargo Operator'],
  },
  'LPG Carrier': {
    'Deck': ['LPG Officer', 'Cargo Officer', 'Pumpman'],
    'Engine': ['Cargo Engineer', 'Gas Engineer', 'Cargo Operator'],
  },
  'Bulk Carrier': { 'Deck': ['Pumpman'] },
  'Container': {},
  'General Cargo': {},
  'Ro-Ro': {},
  'Car Carrier': {},
};

// ── Derived fields ───────────────────────────────────────────────────────────
// Designation is the document's "Experience/Qualification" filter, mapped onto
// Job.designation's fixed enum by rank keywords. Order matters: first hit wins.
const DESIGNATION_RULES = [
  [/cadet|trainee/, 'Trainee / Cadet'],
  [/^(captain|master|staff captain|hotel director|cruise director)|director$|^executive (chef|housekeeper)/, 'Management'],
  [/^chief (officer|engineer)|^executive|manager$/, 'Head of Department'],
  [/^2nd |senior|doctor|\(sso\)|sommelier/, 'Senior Officer'],
  [/officer|^3rd |^4th |^junior |engineer|chef|nurse|therapist|instructor|counselor|technician|supervisor|concierge/, 'Junior Officer'],
  [/bosun|quartermaster|bartender|baker|butcher|fitter|welder|plumber|motorman|receptionist|pumpman/, 'Petty Officer'],
];
const MIN_YEARS = {
  'Trainee / Cadet': 0, 'Rating': 1, 'Petty Officer': 2, 'Junior Officer': 3,
  'Senior Officer': 5, 'Head of Department': 8, 'Management': 10,
};

function designationOf(rank) {
  const r = rank.toLowerCase();
  const hit = DESIGNATION_RULES.find(([re]) => re.test(r));
  return hit ? hit[1] : 'Rating';
}

// Flattens both sections into the row shape a Job document needs.
function buildRows() {
  const rows = [];
  for (const [department, ranks] of Object.entries(CRUISE)) {
    for (const rank of ranks) {
      rows.push({ category: 'Cruise Ships', vesselType: 'Cruise', department, rank });
    }
  }
  for (const [vesselType, extras] of Object.entries(MERCHANT)) {
    const byDept = {
      'Deck': [...MN_DECK, ...(extras['Deck'] || [])],
      'Engine': [...MN_ENGINE, ...(extras['Engine'] || [])],
      'Catering / Galley': [...MN_GALLEY, ...(extras['Catering / Galley'] || [])],
    };
    for (const [department, ranks] of Object.entries(byDept)) {
      for (const rank of ranks) {
        rows.push({ category: 'Merchant Navy', vesselType, department, rank });
      }
    }
  }
  return rows;
}

function describe({ rank, department, vesselType, category }) {
  const designation = designationOf(rank);
  return [
    `${rank} vacancy in the ${department} department aboard ${vesselType} vessels (${category}).`,
    `Level: ${designation}. Minimum ${MIN_YEARS[designation]} year(s) of relevant shipboard experience.`,
    'Valid STCW, CDC, medical fitness certificate and passport required. Contract duration, salary and joining details are confirmed at interview.',
  ].join('\n\n');
}

// ── Self-check: node src/scripts/seedMaritimeJobs.js --check ─────────────────
function selfCheck() {
  const rows = buildRows();
  const cruise = rows.filter((r) => r.category === 'Cruise Ships');
  const spine = MN_DECK.length + MN_ENGINE.length + MN_GALLEY.length;
  const extras = Object.values(MERCHANT).reduce(
    (n, e) => n + Object.values(e).reduce((m, list) => m + list.length, 0), 0
  );
  assert.strictEqual(cruise.length, Object.values(CRUISE).flat().length, 'cruise rows lost in flatten');
  assert.strictEqual(rows.length - cruise.length, Object.keys(MERCHANT).length * spine + extras, 'merchant row count off');
  assert.strictEqual(
    new Set(rows.map((r) => `${r.rank}|${r.department}|${r.vesselType}`)).size,
    rows.length,
    'duplicate upsert keys — two rows would collide into one job'
  );
  assert.strictEqual(designationOf('Deck Cadet'), 'Trainee / Cadet');
  assert.strictEqual(designationOf('Captain / Master'), 'Management');
  assert.strictEqual(designationOf('F&B Director'), 'Management');
  assert.strictEqual(designationOf('Chief Engineer'), 'Head of Department');
  assert.strictEqual(designationOf('Restaurant Manager'), 'Head of Department');
  assert.strictEqual(designationOf('2nd Officer'), 'Senior Officer');
  assert.strictEqual(designationOf('3rd Engineer'), 'Junior Officer');
  assert.strictEqual(designationOf('Bosun'), 'Petty Officer');
  assert.strictEqual(designationOf('Dishwasher'), 'Rating');
  assert.ok(rows.every((r) => describe(r).length <= 5000), 'description exceeds schema max');
  assert.ok(rows.every((r) => r.rank.length <= 100 && r.department.length <= 100), 'rank/department exceeds schema max');
  console.log(`OK — ${rows.length} rows (${cruise.length} cruise, ${rows.length - cruise.length} merchant).`);
}

// ── Run ──────────────────────────────────────────────────────────────────────
async function upsertTaxonomy(type, names) {
  for (const [i, name] of names.entries()) {
    await JobTaxonomy.findOneAndUpdate(
      { type, name },
      { $set: { type, name, isActive: true }, $setOnInsert: { sortOrder: (i + 1) * 10 } },
      { upsert: true, setDefaultsOnInsert: true, collation: { locale: 'en', strength: 2 } }
    );
  }
  console.log(`  ✓ ${names.length} ${type} entries`);
}

(async () => {
  const args = process.argv.slice(2);
  if (args.includes('--check')) return selfCheck();

  const publish = args.includes('--publish');
  const rows = buildRows();

  await mongoose.connect(process.env.MONGODB_URI);

  await upsertTaxonomy('category', ['Cruise Ships', 'Merchant Navy']);
  await upsertTaxonomy('department', [...new Set(rows.map((r) => r.department))]);
  await upsertTaxonomy('vesselType', [...new Set(rows.map((r) => r.vesselType))]);

  if (args.includes('--taxonomy-only')) {
    console.log('Taxonomy only — done.');
    return mongoose.disconnect();
  }

  const admin = await User.findOne({ role: ROLES.ADMIN }).select('_id').lean();
  if (!admin) throw new Error('No admin user found — run seedAdminUser.js first (Job.createdBy is required).');

  let created = 0;
  for (const row of rows) {
    const { category, vesselType, department, rank } = row;
    const designation = designationOf(rank);
    const res = await Job.updateOne(
      { title: rank, department, vesselType },
      {
        $setOnInsert: {
          title: rank,
          companyName: COMPANY_NAME,
          department,
          rank,
          designation,
          category,
          vesselType,
          location: LOCATION,
          employmentType: 'Contract',
          experience: { minYears: MIN_YEARS[designation], maxYears: null },
          description: describe(row),
          requiredDocuments: REQUIRED_DOCUMENTS,
          status: publish ? 'published' : 'draft',
          publishedAt: publish ? new Date() : null,
          createdBy: admin._id,
        },
      },
      { upsert: true }
    );
    if (res.upsertedCount) created += 1;
  }

  console.log(`Seeded ${created} new jobs (${rows.length - created} already existed) as ${publish ? 'published' : 'drafts'}.`);
  await mongoose.disconnect();
})().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
