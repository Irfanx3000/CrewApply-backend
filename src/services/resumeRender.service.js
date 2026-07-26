'use strict';

const crypto = require('crypto');
const CareerProfile = require('../models/careerProfile.model');
const ResumeConfiguration = require('../models/resumeConfiguration.model');
const ResumeTemplate = require('../models/resumeTemplate.model');
const Document = require('../models/document.model');
const Application = require('../models/application.model');
const aggregation = require('./careerProfileAggregation.service');
const composer = require('./resumeComposer.service');
const { buildDocumentModel } = require('../engine/buildDocumentModel');
const rendererRegistry = require('../engine/rendererRegistry');
const { saveBuffer } = require('./storage.service');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

// Orchestration only: load -> composer.resolveContent() -> engine.build ->
// engine.render() -> storage -> Document record. The engine itself (and the
// composer) know nothing about MongoDB/Express; this is the one layer that
// bridges them.
//
// KNOWN LIMITATION (not solved in this pass): document.service.js's
// getResume(userId) assumes a single active 'resume' Document per user. Once
// a user has multiple named ResumeConfigurations, each can have its own
// active generated Document simultaneously (by design — see
// architecture doc A7) — getResume() becomes ambiguous about "the" resume.
// Only THIS resumeConfiguration's previous generated Document is archived
// below (never another named resume's), so that part is correct; picking
// "the right resume" for a job application is a product decision for a
// later pass (e.g. always ask, or suggest by title match), not this one.
//
// Applications DO get kept in sync on regenerate, though: any Application
// whose submittedDocuments snapshot points at an earlier generated Document
// of THIS SAME resumeConfiguration is re-pointed at the fresh one below
// (see repointApplications). Applications built from a different named
// resume, or from a manually uploaded (not generated) resume, are untouched.

const contentHash = (content, templateId) =>
  crypto.createHash('sha256').update(JSON.stringify({ content, templateId })).digest('hex');

// Re-points every Application whose 'resume' snapshot references one of this
// resumeConfiguration's earlier generated documents at the freshly generated
// one, so an employer reviewing a submitted application always sees the
// applicant's current resume, not whatever version happened to exist at
// apply-time. Scoped deliberately narrow: only documents this SAME named
// resume produced (never a different named resume, never a manually
// uploaded one), and only the 'resume' slot of submittedDocuments.
const repointApplications = async (userId, previousDocumentIds, newDocumentId) => {
  if (!previousDocumentIds?.length) return;

  await Application.updateMany(
    { user: userId, submittedDocuments: { $elemMatch: { category: 'resume', document: { $in: previousDocumentIds } } } },
    { $set: { 'submittedDocuments.$[elem].document': newDocumentId } },
    { arrayFilters: [{ 'elem.category': 'resume', 'elem.document': { $in: previousDocumentIds } }] }
  );
};

const generate = async (userId, resumeConfigurationId, { format = 'pdf' } = {}) => {
  const resumeConfig = await ResumeConfiguration.findOne({ _id: resumeConfigurationId, user: userId });
  if (!resumeConfig) {
    throw new AppError(AUTH_MESSAGES.RESUME_CONFIGURATION_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  // .lean() is deliberate here, not an optimization detail: without it,
  // careerProfile.experience[i].responsibilities is a live MongooseArray
  // still attached to its parent document's schema. pdfmake's internal list
  // preprocessor normalizes `ul` items IN PLACE (content[i] = {text: ...}),
  // which — if that array is still Mongoose-backed — re-triggers a CAST of
  // the new object back against the `responsibilities: [String]` path and
  // throws. The composer/engine must only ever see plain, fully-detached
  // data, never a live document, precisely to rule out this class of bug.
  const [careerProfile, template, aggregated] = await Promise.all([
    CareerProfile.findById(resumeConfig.careerProfile).lean(),
    ResumeTemplate.findOne({ _id: resumeConfig.templateId, isActive: true }).lean(),
    aggregation.getAggregatedProfile(userId),
  ]);

  if (!careerProfile) {
    throw new AppError(AUTH_MESSAGES.NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }
  if (!template) {
    throw new AppError(AUTH_MESSAGES.RESUME_TEMPLATE_NOT_FOUND, HTTP_STATUS.BAD_REQUEST, 'INVALID_TEMPLATE');
  }

  const content = composer.resolveContent(careerProfile, resumeConfig, aggregated);
  const documentModel = buildDocumentModel(content, template.layout);
  const buffer = await rendererRegistry.get(format).render(documentModel);

  const version = (resumeConfig.metadata.generatedDocumentIds?.length || 0) + 1;
  const filename = `${crypto.randomUUID()}.pdf`;
  const relativePath = saveBuffer(buffer, 'resumes', filename);

  // Archive only THIS resume configuration's previous generated document —
  // never another named resume's, and never an uploaded (non-generated) one.
  await Document.updateMany(
    { user: userId, source: 'generated', 'generatedFrom.resumeConfigurationId': resumeConfig._id, status: 'active' },
    { $set: { status: 'archived' } }
  );

  const doc = await Document.create({
    user: userId,
    category: 'resume',
    originalName: `${resumeConfig.title}.pdf`,
    storedName: filename,
    path: relativePath,
    mimeType: 'application/pdf',
    size: buffer.length,
    status: 'active',
    source: 'generated',
    generatedFrom: { resumeConfigurationId: resumeConfig._id, templateId: template._id, version },
  });

  // Snapshot fixup: any application that was submitted using an earlier
  // generated version of THIS SAME named resume now points at a document
  // that's about to go stale — move it forward to the one just generated.
  // `generatedDocumentIds` here still holds only the earlier versions; the
  // new id is pushed onto it further down.
  await repointApplications(userId, resumeConfig.metadata.generatedDocumentIds, doc._id);

  resumeConfig.metadata.lastGeneratedAt = new Date();
  resumeConfig.metadata.lastGeneratedDocumentId = doc._id;
  resumeConfig.metadata.generatedDocumentIds.push(doc._id);
  resumeConfig.metadata.contentHashAtLastGeneration = contentHash(content, template._id);
  await resumeConfig.save();

  return doc;
};

const getHistory = async (userId, resumeConfigurationId) => {
  const resumeConfig = await ResumeConfiguration.findOne({ _id: resumeConfigurationId, user: userId }).lean();
  if (!resumeConfig) {
    throw new AppError(AUTH_MESSAGES.RESUME_CONFIGURATION_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }
  return Document.find({ _id: { $in: resumeConfig.metadata.generatedDocumentIds || [] } })
    .sort({ createdAt: -1 })
    .lean();
};

module.exports = { generate, getHistory };
