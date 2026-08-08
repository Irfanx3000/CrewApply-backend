'use strict';

const ResumeConfiguration = require('../models/resumeConfiguration.model');
const ResumeTemplate = require('../models/resumeTemplate.model');
const Document = require('../models/document.model');
const CareerProfile = require('../models/careerProfile.model');
const careerProfileService = require('./careerProfile.service');
const aggregation = require('./careerProfileAggregation.service');
const composer = require('./resumeComposer.service');
const { contentHash } = require('./resumeRender.service');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

const ALLOWED_UPDATE_FIELDS = ['title', 'templateId', 'objectiveOverride', 'selection', 'visibility'];

const pick = (source, fields) =>
  fields.reduce((acc, field) => {
    if (Object.prototype.hasOwnProperty.call(source, field)) acc[field] = source[field];
    return acc;
  }, {});

/**
 * Flags every already-generated resume whose PDF no longer matches the profile
 * it was built from.
 *
 * A generated PDF is a frozen artifact — deleting a certificate in My
 * Documents can't reach inside a file that's already on disk. The live
 * sections of the Career Profile screen self-correct (they re-read active
 * Documents on every request), but the PDF silently keeps showing whatever was
 * true the day it was rendered. `contentHashAtLastGeneration` was recorded for
 * exactly this comparison; nothing had ever read it back.
 *
 * Resolves the content the same way a render would and compares hashes, so
 * this covers every input to the resume — deleted/added documents, edited
 * personal details, career profile entries, template switches — not just
 * documents.
 */
const withStaleness = async (userId, configs) => {
  const generated = configs.filter(
    (c) => c.metadata?.lastGeneratedDocumentId && c.metadata?.contentHashAtLastGeneration
  );
  // Never generated (or generated before hashes were recorded) => nothing to
  // be stale against; skip the profile/aggregation reads entirely.
  if (!generated.length) return configs.map((c) => ({ ...c, isStale: false }));

  const [careerProfile, aggregated] = await Promise.all([
    CareerProfile.findOne({ user: userId }).lean(),
    aggregation.getAggregatedProfile(userId),
  ]);
  if (!careerProfile) return configs.map((c) => ({ ...c, isStale: false }));

  const staleIds = new Set(
    generated
      .filter((c) => {
        const current = contentHash(composer.resolveContent(careerProfile, c, aggregated), c.templateId);
        return current !== c.metadata.contentHashAtLastGeneration;
      })
      .map((c) => String(c._id))
  );

  return configs.map((c) => ({ ...c, isStale: staleIds.has(String(c._id)) }));
};

const list = async (userId) => {
  const configs = await ResumeConfiguration.find({ user: userId }).sort({ updatedAt: -1 }).lean();
  return withStaleness(userId, configs);
};

const getById = async (userId, id) => {
  const config = await ResumeConfiguration.findOne({ _id: id, user: userId }).lean();
  if (!config) {
    throw new AppError(AUTH_MESSAGES.RESUME_CONFIGURATION_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }
  return config;
};

const assertTemplateActive = async (templateId) => {
  const template = await ResumeTemplate.findOne({ _id: templateId, isActive: true }).lean();
  if (!template) {
    throw new AppError(AUTH_MESSAGES.RESUME_TEMPLATE_NOT_FOUND, HTTP_STATUS.BAD_REQUEST, 'INVALID_TEMPLATE');
  }
  return template;
};

// New resumes default to including everything currently on the Career
// Profile — a sensible starting point the user can then deselect from,
// rather than forcing them to check every box on their first resume. A
// LATER addition to the profile does NOT retroactively get added to this
// selection — that's a deliberate curation boundary, not a bug (see
// architecture doc, self-critique #4).
const create = async (userId, body) => {
  await assertTemplateActive(body.templateId);
  const profile = await careerProfileService.getOrCreate(userId);

  const config = await ResumeConfiguration.create({
    user: userId,
    careerProfile: profile._id,
    title: body.title,
    templateId: body.templateId,
    objectiveOverride: body.objectiveOverride || null,
    selection: {
      experienceIds: profile.experience.map((e) => e._id),
      educationIds: profile.education.map((e) => e._id),
      skillIds: profile.skills.map((e) => e._id),
      languageIds: profile.languages.map((e) => e._id),
      referenceIds: profile.references.map((e) => e._id),
    },
    visibility: body.visibility || undefined,
  });

  return config;
};

const update = async (userId, id, body) => {
  const config = await ResumeConfiguration.findOne({ _id: id, user: userId });
  if (!config) {
    throw new AppError(AUTH_MESSAGES.RESUME_CONFIGURATION_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  if (body.templateId) {
    await assertTemplateActive(body.templateId);
  }

  Object.assign(config, pick(body, ALLOWED_UPDATE_FIELDS));
  await config.save();
  return config;
};

// Deleting a named resume also retires the PDFs it produced. Those live in the
// Document collection under category 'resume' (that's how "upload your own CV"
// and "build one from your Career Profile" coexist), so without this they'd
// keep showing in My Documents — and stay eligible to be attached to a new
// application — long after the resume that made them was gone.
//
// Archived, not deleted: the file itself must survive for any application that
// was already submitted with it (see document.service.js's
// getAdminDocumentFile). Only this configuration's own generated documents are
// touched — never another named resume's, never an uploaded CV.
const remove = async (userId, id) => {
  const config = await ResumeConfiguration.findOneAndDelete({ _id: id, user: userId });
  if (!config) {
    throw new AppError(AUTH_MESSAGES.RESUME_CONFIGURATION_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  await Document.updateMany(
    {
      user: userId,
      source: 'generated',
      'generatedFrom.resumeConfigurationId': config._id,
      status: 'active',
    },
    { $set: { status: 'archived' } }
  );

  return config;
};

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
