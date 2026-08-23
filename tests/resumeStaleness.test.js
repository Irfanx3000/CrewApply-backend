'use strict';

// Resume staleness regression test.
//
// withStaleness() now answers two questions, not one, and the interaction
// between them is easy to get wrong in both directions:
//
//   * a free user must NEVER be told to regenerate over a watermark — they
//     would get another watermarked file and file a support ticket
//   * a subscribed user with an unchanged profile MUST be told, because that
//     is the exact case that previously left them paying to remove a watermark
//     that stayed put
//
// Runs against an isolated throwaway database, dropped at the end.

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

require('dotenv').config({ quiet: true });

const TEST_DB = 'crewapply_hardening_test_resume';

const testUri = () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required to run these tests.');
  const [base, query] = uri.split('?');
  return `${base.replace(/\/[^/]*$/, '')}/${TEST_DB}${query ? `?${query}` : ''}`;
};

let resumeConfigService;
let entitlementService;
let composer;
let Document;
let CareerProfile;
let ResumeConfiguration;

const userId = new mongoose.Types.ObjectId();
const templateId = new mongoose.Types.ObjectId();

// Stubbed so the test pins the STALENESS logic, not the composer or the
// subscription lookup — both have their own behaviour and their own bugs.
let subscribed = false;
let resolvedContent = { summary: 'original' };

test.before(async () => {
  await mongoose.connect(testUri());

  Document = require('../src/models/document.model');
  CareerProfile = require('../src/models/careerProfile.model');
  ResumeConfiguration = require('../src/models/resumeConfiguration.model');
  entitlementService = require('../src/services/entitlement.service');
  composer = require('../src/services/resumeComposer.service');
  resumeConfigService = require('../src/services/resumeConfiguration.service');

  entitlementService.hasActiveSubscription = async () => subscribed;
  composer.resolveContent = () => resolvedContent;

  const aggregation = require('../src/services/careerProfileAggregation.service');
  aggregation.getAggregatedProfile = async () => ({});

  // withStaleness bails early unless a CareerProfile exists for the user.
  await CareerProfile.create({ user: userId });
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

/** Creates a generated resume whose last render was (or wasn't) watermarked. */
const seedResume = async ({ watermarked }) => {
  const { contentHash } = require('../src/services/resumeRender.service');

  const doc = await Document.create({
    user: userId,
    category: 'resume',
    originalName: 'resume.pdf',
    storedName: `${new mongoose.Types.ObjectId()}.pdf`,
    path: 'uploads/resumes/x.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    generatedFrom: { templateId, watermarked },
  });

  return ResumeConfiguration.create({
    user: userId,
    title: `Resume ${watermarked ? 'wm' : 'clean'}`,
    templateId,
    careerProfile: (await CareerProfile.findOne({ user: userId }).lean())._id,
    metadata: {
      lastGeneratedDocumentId: doc._id,
      contentHashAtLastGeneration: contentHash(resolvedContent, templateId),
    },
  });
};

const staleStateOf = async (configId) => {
  const list = await resumeConfigService.list(userId);
  return list.find((c) => String(c._id) === String(configId));
};

test('free user, watermarked PDF, unchanged profile -> NOT stale', async () => {
  subscribed = false;
  const cfg = await seedResume({ watermarked: true });

  const result = await staleStateOf(cfg._id);
  assert.equal(result.isStale, false,
    'a free user must not be prompted to regenerate — they would just get another watermark');
  assert.equal(result.staleReason, null);

  await ResumeConfiguration.deleteOne({ _id: cfg._id });
});

test('SUBSCRIBED user, watermarked PDF, unchanged profile -> stale (watermark)', async () => {
  subscribed = true;
  const cfg = await seedResume({ watermarked: true });

  const result = await staleStateOf(cfg._id);
  assert.equal(result.isStale, true,
    'this is the paid-but-still-watermarked case that previously went unnoticed');
  assert.equal(result.staleReason, 'watermark');

  await ResumeConfiguration.deleteOne({ _id: cfg._id });
});

test('subscribed user, clean PDF, unchanged profile -> NOT stale', async () => {
  subscribed = true;
  const cfg = await seedResume({ watermarked: false });

  const result = await staleStateOf(cfg._id);
  assert.equal(result.isStale, false,
    'an unwatermarked resume for a subscriber has nothing to regenerate for');
  assert.equal(result.staleReason, null);

  await ResumeConfiguration.deleteOne({ _id: cfg._id });
});

test('changed profile still reports content staleness, and it outranks watermark', async () => {
  subscribed = true;
  const cfg = await seedResume({ watermarked: true });

  // The profile changes after the render.
  resolvedContent = { summary: 'edited after generation' };
  try {
    const result = await staleStateOf(cfg._id);
    assert.equal(result.isStale, true);
    assert.equal(result.staleReason, 'content',
      'wrong details are more urgent than an undeserved watermark');
  } finally {
    resolvedContent = { summary: 'original' };
    await ResumeConfiguration.deleteOne({ _id: cfg._id });
  }
});

test('a never-generated resume is never stale', async () => {
  subscribed = true;
  const cfg = await ResumeConfiguration.create({
    user: userId,
    title: 'Never generated',
    templateId,
    careerProfile: (await CareerProfile.findOne({ user: userId }).lean())._id,
  });

  const result = await staleStateOf(cfg._id);
  assert.equal(result.isStale, false);
  assert.equal(result.staleReason, null);

  await ResumeConfiguration.deleteOne({ _id: cfg._id });
});
