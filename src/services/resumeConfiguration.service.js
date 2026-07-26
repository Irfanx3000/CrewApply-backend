'use strict';

const ResumeConfiguration = require('../models/resumeConfiguration.model');
const ResumeTemplate = require('../models/resumeTemplate.model');
const careerProfileService = require('./careerProfile.service');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

const ALLOWED_UPDATE_FIELDS = ['title', 'templateId', 'objectiveOverride', 'selection', 'visibility'];

const pick = (source, fields) =>
  fields.reduce((acc, field) => {
    if (Object.prototype.hasOwnProperty.call(source, field)) acc[field] = source[field];
    return acc;
  }, {});

const list = (userId) => ResumeConfiguration.find({ user: userId }).sort({ updatedAt: -1 }).lean();

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

const remove = async (userId, id) => {
  const config = await ResumeConfiguration.findOneAndDelete({ _id: id, user: userId });
  if (!config) {
    throw new AppError(AUTH_MESSAGES.RESUME_CONFIGURATION_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }
  return config;
};

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
