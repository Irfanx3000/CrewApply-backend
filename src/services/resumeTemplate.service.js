'use strict';

const ResumeTemplate = require('../models/resumeTemplate.model');
const auditService = require('./audit.service');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');
const { AUDIT_EVENTS } = require('../constants/audit');

// Admin-only management of the resume-template catalogue — mirrors
// documentType.service.js/jobTaxonomy.service.js exactly.

const ALLOWED_UPDATE_FIELDS = ['name', 'description', 'thumbnailUrl', 'category', 'isActive', 'sortOrder', 'layout'];

const pick = (source, fields) =>
  fields.reduce((acc, field) => {
    if (Object.prototype.hasOwnProperty.call(source, field)) acc[field] = source[field];
    return acc;
  }, {});

const listActive = () => ResumeTemplate.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();

const listAll = (includeInactive) => {
  const filter = includeInactive ? {} : { isActive: true };
  return ResumeTemplate.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
};

const getById = async (id) => {
  const template = await ResumeTemplate.findById(id).lean();
  if (!template) {
    throw new AppError(AUTH_MESSAGES.RESUME_TEMPLATE_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }
  return template;
};

const create = async (body, adminId) => {
  const exists = await ResumeTemplate.findOne({ key: body.key });
  if (exists) {
    throw new AppError(AUTH_MESSAGES.RESUME_TEMPLATE_KEY_EXISTS, HTTP_STATUS.CONFLICT, 'RESUME_TEMPLATE_EXISTS');
  }

  const template = await ResumeTemplate.create({
    key: body.key,
    ...pick(body, ALLOWED_UPDATE_FIELDS),
    createdBy: adminId,
  });

  auditService.log({ event: AUDIT_EVENTS.RESUME_TEMPLATE_CREATED, userId: adminId, metadata: { resumeTemplateId: template._id, key: template.key } }).catch(() => {});
  return template;
};

const update = async (id, body, adminId) => {
  const template = await ResumeTemplate.findById(id);
  if (!template) {
    throw new AppError(AUTH_MESSAGES.RESUME_TEMPLATE_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  Object.assign(template, pick(body, ALLOWED_UPDATE_FIELDS));
  template.updatedBy = adminId;
  await template.save();

  auditService.log({ event: AUDIT_EVENTS.RESUME_TEMPLATE_UPDATED, userId: adminId, metadata: { resumeTemplateId: template._id, key: template.key } }).catch(() => {});
  return template;
};

// Soft-deactivate only — never hard-delete a template existing resumes reference.
const deactivate = async (id, adminId) => {
  const template = await ResumeTemplate.findByIdAndUpdate(id, { $set: { isActive: false, updatedBy: adminId } }, { new: true });
  if (!template) {
    throw new AppError(AUTH_MESSAGES.RESUME_TEMPLATE_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  auditService.log({ event: AUDIT_EVENTS.RESUME_TEMPLATE_DEACTIVATED, userId: adminId, metadata: { resumeTemplateId: template._id, key: template.key } }).catch(() => {});
  return template;
};

module.exports = {
  listActive,
  listAll,
  getById,
  create,
  update,
  deactivate,
};
