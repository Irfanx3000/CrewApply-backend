'use strict';

// RESETS the job catalogue: deletes every existing job (and what hangs off
// those jobs), then seeds a fresh role library from the client's job-category
// document, organised as:
//
//   Ship Type   Cruise                  Merchant Navy
//   Deck        ✓ cruise deck roles     ✓ merchant deck roles
//   Engine      ✓ cruise engine roles   ✓ merchant engine roles
//   Hotel       ✓ all hotel-side roles  ✗ (cruise only)
//
// DRY RUN BY DEFAULT. Deleting is irreversible and deliberately goes further
// than the admin panel will: jobService.deleteJob refuses published jobs and
// jobs with applicants, to protect applicant history. A catalogue reset has to
// remove those too, so run without --confirm first and read the counts.
//
//   node src/scripts/seedMaritimeJobs.js                      # dry run: counts only, changes nothing
//   node src/scripts/seedMaritimeJobs.js --confirm            # delete + seed, jobs as DRAFTS
//   node src/scripts/seedMaritimeJobs.js --confirm --publish  # delete + seed, jobs PUBLISHED
//   node src/scripts/seedMaritimeJobs.js --check              # self-check, no DB
//
// What a job reset has to clean up (a job is referenced from three places):
//   · Application.job     — an orphaned application still counts against the
//                           user's paid application quota (application.service
//                           counts Application documents), so they go too.
//   · User.savedJobs      — ObjectId array; pulled.
//   · Notification.data   — "New job posted" (jobId) and status updates
//                           (applicationId). Stored as ObjectId in one and as a
//                           string in the other, so both forms are matched.
//
// Taxonomy: the Ship Type and Department lists are SHARED with more than jobs —
// the career-profile experience editor offers Ship Types (a user who served on
// a Tanker must still be able to say so) and signup/maritime profile offers
// Departments. So nothing is deactivated there; the script only makes sure the
// entries the new jobs use exist and are active. The two categories the
// previous version of this script created ("Cruise Ships", "Merchant Navy") ARE
// deactivated: no job carries them any more, and as home-screen category cards
// they would open empty lists.
//
// Published jobs inserted here do NOT trigger the new-job push/email fan-out —
// that only runs through jobService — so --publish does not notify every user.

require('dotenv').config();
const assert = require('assert');
const mongoose = require('mongoose');
const Job = require('../models/job.model');
const Application = require('../models/application.model');
const Notification = require('../models/notification.model');
const JobTaxonomy = require('../models/jobTaxonomy.model');
const User = require('../models/user.model');
const { ROLES } = require('../constants/roles');

// ── Names the jobs are stored under ──────────────────────────────────────────
// Deck/Engine/Cruise already exist in the taxonomy (seedJobTaxonomy.js).
// Hotel reuses the existing "Hotel / Hospitality" department rather than adding
// a near-duplicate "Hotel" that signup's department dropdown would then show
// side by side with it. Change the string here if a plain "Hotel" is wanted.
const SHIP = { CRUISE: 'Cruise', MERCHANT: 'Merchant Navy' };
const DEPT = { DECK: 'Deck', ENGINE: 'Engine', HOTEL: 'Hotel / Hospitality' };

// Job.category drives the app's home-screen category cards
// (seedJobCategories.js: Deck, Engine, Hospitality, Catering, Others).
const CATEGORY_FOR_DEPT = { [DEPT.DECK]: 'Deck', [DEPT.ENGINE]: 'Engine', [DEPT.HOTEL]: 'Hospitality' };
const RETIRED_CATEGORIES = ['Cruise Ships', 'Merchant Navy'];

// Edit before a real run — the only values a human has to choose.
const COMPANY_NAME = 'CrewApply';
const LOCATION = { country: 'International', city: null };
const REQUIRED_DOCUMENTS = ['resume', 'passport', 'cdc', 'medical', 'stcw'];

// ── Roles, from the client's document ────────────────────────────────────────
const ROLES_BY = {
  [SHIP.CRUISE]: {
    [DEPT.DECK]: [
      'Captain / Master', 'Staff Captain', 'Chief Officer', '2nd Officer', '3rd Officer',
      'Junior Officer', 'Deck Cadet', 'Bosun', 'Able Seaman (AB)', 'Ordinary Seaman (OS)',
      'Deck Rating', 'Quartermaster', 'Watchman', 'Safety Officer', 'Environmental Officer',
      'Security Officer', 'Security Supervisor', 'Security Guard',
      'Ship Security Officer (SSO)', 'Security Staff',
    ],
    [DEPT.ENGINE]: [
      'Chief Engineer', '2nd Engineer', '3rd Engineer', '4th Engineer', 'Junior Engineer',
      'Engine Cadet', 'Electrical Engineer', 'Electro-Technical Officer (ETO)',
      'Electro-Technical Rating (ETR)', 'Refrigeration Engineer', 'HVAC Technician',
      'Motorman', 'Oiler', 'Wiper', 'Fitter', 'Welder', 'Plumber', 'Engine Room Rating',
    ],
    // On a cruise ship everything guest-facing reports into the hotel
    // department — the document's sections C–K, grouped here in its order.
    [DEPT.HOTEL]: [
      // Housekeeping
      'Executive Housekeeper', 'Housekeeping Manager', 'Assistant Housekeeping Manager',
      'Housekeeping Supervisor', 'Cabin Steward', 'Assistant Cabin Steward',
      'Public Area Attendant', 'Laundry Manager', 'Laundry Attendant', 'Linen Keeper',
      'Bellman', 'Stateroom Attendant',
      // Food & Beverage
      'F&B Director', 'Restaurant Manager', 'Assistant Restaurant Manager',
      'Restaurant Supervisor', 'Waiter / Waitress', 'Assistant Waiter', 'Buffet Attendant',
      'Bar Manager', 'Bartender', 'Bar Waiter', 'Sommelier', 'Room Service Attendant',
      // Culinary / Galley
      'Executive Chef', 'Executive Sous Chef', 'Sous Chef', 'Chef de Partie', 'Demi Chef',
      'Commis Chef', 'Pastry Chef', 'Baker', 'Butcher', 'Galley Steward', 'Kitchen Utility',
      'Dishwasher',
      // Guest Services
      'Hotel Director', 'Guest Services Manager', 'Guest Services Officer', 'Receptionist',
      'Guest Relations Officer', 'Concierge', 'Shore Excursion Staff', 'Tour Staff',
      'Cruise Staff',
      // Entertainment
      'Cruise Director', 'Assistant Cruise Director', 'Entertainment Manager',
      'Host / Hostess', 'Activities Staff', 'Dancer', 'Singer', 'Musician', 'DJ',
      'Performer', 'Stage Technician', 'Lighting Technician', 'Sound Technician',
      'Production Staff',
      // Spa / Fitness / Beauty
      'Spa Manager', 'Spa Therapist', 'Massage Therapist', 'Beauty Therapist',
      'Hairdresser', 'Barber', 'Fitness Director', 'Fitness Instructor', 'Personal Trainer',
      'Yoga Instructor', 'Sports Instructor', 'Lifeguard',
      // Medical
      'Ship Doctor', 'Staff Doctor', 'Nurse', 'Medical Assistant', 'Medical Receptionist',
      // Retail / Casino
      'Retail Manager', 'Retail Sales Associate', 'Jewelry Sales Associate', 'Duty-Free Sales',
      'Casino Manager', 'Casino Supervisor', 'Casino Dealer', 'Casino Cashier',
      // Youth / Family
      'Youth Staff', 'Kids Club Staff', 'Youth Counselor', 'Babysitter / Childcare Staff',
    ],
  },
  // The document lists merchant roles per vessel class (tanker, bulk, container,
  // …). With one "Merchant Navy" ship type those lists merge into their union.
  // Cook and Steward are dropped: they are neither deck nor engine, and the
  // hotel department is cruise-only.
  [SHIP.MERCHANT]: {
    [DEPT.DECK]: [
      'Master', 'Chief Officer', '2nd Officer', '3rd Officer', 'Deck Cadet', 'Bosun',
      'Able Seaman (AB)', 'Ordinary Seaman (OS)', 'Pumpman', 'Cargo Officer',
      'Chemical Tanker Officer', 'LNG Officer', 'LPG Officer',
    ],
    [DEPT.ENGINE]: [
      'Chief Engineer', '2nd Engineer', '3rd Engineer', '4th Engineer', 'Engine Cadet',
      'Electro-Technical Officer (ETO)', 'Motorman', 'Oiler', 'Fitter',
      'Cargo Engineer', 'Gas Engineer', 'Cargo Operator',
    ],
  },
};

// ── Derived fields ───────────────────────────────────────────────────────────
// Job.designation (the "Experience/Qualification" filter) from rank keywords.
// First matching rule wins.
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

function buildRows() {
  const rows = [];
  for (const [vesselType, departments] of Object.entries(ROLES_BY)) {
    for (const [department, ranks] of Object.entries(departments)) {
      for (const rank of ranks) rows.push({ vesselType, department, rank });
    }
  }
  return rows;
}

function describe({ rank, department, vesselType }) {
  const designation = designationOf(rank);
  return [
    `${rank} vacancy in the ${department} department aboard ${vesselType} vessels.`,
    `Level: ${designation}. Minimum ${MIN_YEARS[designation]} year(s) of relevant shipboard experience.`,
    'Valid STCW, CDC, medical fitness certificate and passport required. Contract duration, salary and joining details are confirmed at interview.',
  ].join('\n\n');
}

function toJob(row, { publish, adminId }) {
  const designation = designationOf(row.rank);
  return {
    title: row.rank,
    companyName: COMPANY_NAME,
    department: row.department,
    rank: row.rank,
    designation,
    category: CATEGORY_FOR_DEPT[row.department],
    vesselType: row.vesselType,
    location: LOCATION,
    employmentType: 'Contract',
    experience: { minYears: MIN_YEARS[designation], maxYears: null },
    description: describe(row),
    requiredDocuments: REQUIRED_DOCUMENTS,
    status: publish ? 'published' : 'draft',
    publishedAt: publish ? new Date() : null,
    createdBy: adminId,
  };
}

// ── Self-check: node src/scripts/seedMaritimeJobs.js --check ─────────────────
async function selfCheck() {
  const rows = buildRows();
  const count = (ship, dept) => rows.filter((r) => r.vesselType === ship && r.department === dept).length;

  // The requirement itself.
  assert.deepStrictEqual([...new Set(rows.map((r) => r.vesselType))].sort(), [SHIP.CRUISE, SHIP.MERCHANT].sort(), 'ship types');
  assert.deepStrictEqual([...new Set(rows.map((r) => r.department))].sort(), Object.values(DEPT).sort(), 'departments');
  assert.strictEqual(count(SHIP.MERCHANT, DEPT.HOTEL), 0, 'hotel jobs must be cruise-only');
  for (const ship of Object.values(SHIP)) {
    assert.ok(count(ship, DEPT.DECK) > 0 && count(ship, DEPT.ENGINE) > 0, `${ship} needs deck and engine jobs`);
  }
  assert.ok(count(SHIP.CRUISE, DEPT.HOTEL) > 0, 'cruise needs hotel jobs');

  // Data sanity.
  const keys = rows.map((r) => `${r.vesselType}|${r.department}|${r.rank}`);
  assert.strictEqual(new Set(keys).size, keys.length, 'duplicate role within a ship type + department');
  const job = toJob(rows[0], { publish: false, adminId: new mongoose.Types.ObjectId() });
  await new Job(job).validate(); // throws with the failing field if the schema rejects it
  assert.ok(rows.every((r) => CATEGORY_FOR_DEPT[r.department]), 'every department maps to a category');
  assert.ok(rows.every((r) => describe(r).length <= 5000 && r.rank.length <= 100), 'field length limits');

  assert.strictEqual(designationOf('Deck Cadet'), 'Trainee / Cadet');
  assert.strictEqual(designationOf('Captain / Master'), 'Management');
  assert.strictEqual(designationOf('Chief Engineer'), 'Head of Department');
  assert.strictEqual(designationOf('2nd Officer'), 'Senior Officer');
  assert.strictEqual(designationOf('3rd Engineer'), 'Junior Officer');
  assert.strictEqual(designationOf('Bosun'), 'Petty Officer');
  assert.strictEqual(designationOf('Dishwasher'), 'Rating');

  const table = Object.values(SHIP)
    .map((ship) => `${ship}: deck ${count(ship, DEPT.DECK)}, engine ${count(ship, DEPT.ENGINE)}, hotel ${count(ship, DEPT.HOTEL)}`)
    .join(' | ');
  console.log(`OK — ${rows.length} jobs. ${table}`);
}

// ── Run ──────────────────────────────────────────────────────────────────────
async function ensureTaxonomy(type, names) {
  for (const name of names) {
    await JobTaxonomy.findOneAndUpdate(
      { type, name },
      { $set: { isActive: true }, $setOnInsert: { type, name } },
      { upsert: true, setDefaultsOnInsert: true, collation: { locale: 'en', strength: 2 } }
    );
  }
}

(async () => {
  const args = process.argv.slice(2);
  if (args.includes('--check')) return selfCheck();

  const confirm = args.includes('--confirm');
  const publish = args.includes('--publish');
  const rows = buildRows();

  await mongoose.connect(process.env.MONGODB_URI);

  // ── What the reset touches ──
  const jobIds = await Job.distinct('_id');
  const applicationIds = await Application.distinct('_id', { job: { $in: jobIds } });
  const affectedApplicants = (await Application.distinct('user', { job: { $in: jobIds } })).length;
  const bothForms = (ids) => [...ids, ...ids.map(String)];
  const notificationFilter = {
    $or: [
      { 'data.jobId': { $in: bothForms(jobIds) } },
      { 'data.applicationId': { $in: bothForms(applicationIds) } },
    ],
  };
  const notificationCount = await Notification.countDocuments(notificationFilter);
  const usersWithSaved = await User.countDocuments({ savedJobs: { $in: jobIds } });

  console.log(`\n${confirm ? 'RESETTING' : 'DRY RUN — nothing will be changed'} (${mongoose.connection.name})`);
  console.log('  Delete:');
  console.log(`    ${jobIds.length} jobs`);
  console.log(`    ${applicationIds.length} applications, from ${affectedApplicants} user(s)`);
  console.log(`    ${notificationCount} notifications about those jobs/applications`);
  console.log(`    saved-job bookmarks on ${usersWithSaved} user(s)`);
  console.log(`  Create: ${rows.length} jobs as ${publish ? 'PUBLISHED' : 'drafts'}`);
  for (const ship of Object.values(SHIP)) {
    const per = Object.values(DEPT).map((d) => `${d} ${rows.filter((r) => r.vesselType === ship && r.department === d).length}`);
    console.log(`    ${ship}: ${per.join(', ')}`);
  }

  if (!confirm) {
    console.log('\nRe-run with --confirm to apply.\n');
    return mongoose.disconnect();
  }

  const admin = await User.findOne({ role: ROLES.ADMIN }).select('_id').lean();
  if (!admin) throw new Error('No admin user found — run seedAdminUser.js first (Job.createdBy is required).');

  // Dependents first, jobs last: if this stops half-way, a re-run recomputes
  // everything from the jobs still present and finishes the job.
  const n = await Notification.deleteMany(notificationFilter);
  const a = await Application.deleteMany({ _id: { $in: applicationIds } });
  const s = await User.updateMany({ savedJobs: { $in: jobIds } }, { $pull: { savedJobs: { $in: jobIds } } });
  const j = await Job.deleteMany({ _id: { $in: jobIds } });
  console.log(`\n  ✓ deleted ${j.deletedCount} jobs, ${a.deletedCount} applications, ${n.deletedCount} notifications; cleared bookmarks on ${s.modifiedCount} user(s)`);

  await ensureTaxonomy('vesselType', Object.values(SHIP));
  await ensureTaxonomy('department', Object.values(DEPT));
  await ensureTaxonomy('category', [...new Set(Object.values(CATEGORY_FOR_DEPT))]);
  const retired = await JobTaxonomy.updateMany(
    { type: 'category', name: { $in: RETIRED_CATEGORIES }, isActive: true },
    { $set: { isActive: false } },
    { collation: { locale: 'en', strength: 2 } }
  );
  console.log(`  ✓ taxonomy ready (ship types, departments, categories); retired ${retired.modifiedCount} old categories`);

  // insertMany runs full schema validation on every document.
  const inserted = await Job.insertMany(rows.map((row) => toJob(row, { publish, adminId: admin._id })));
  console.log(`  ✓ created ${inserted.length} jobs as ${publish ? 'published' : 'drafts'}\n`);

  await mongoose.disconnect();
})().catch(async (e) => {
  console.error('Seed failed:', e.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
