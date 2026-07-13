'use strict';

const DocumentType = require('../models/documentType.model');
const auditService = require('./audit.service');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');
const { AUDIT_EVENTS } = require('../constants/audit');

// Admin-only management of the document-type catalogue. Until the admin panel
// exists this is driven via Postman with an admin token — mirrors plan.service.js.

const ALLOWED_UPDATE_FIELDS = [
  'label',
  'description',
  'acceptedFileTypes',
  'maxSizeMB',
  'allowMultiple',
  'isRequirableForJob',
  'icon',
  'isActive',
  'sortOrder',
];

const pick = (source, fields) =>
  fields.reduce((acc, field) => {
    if (Object.prototype.hasOwnProperty.call(source, field)) acc[field] = source[field];
    return acc;
  }, {});

const listActive = () => DocumentType.find({ isActive: true }).sort({ sortOrder: 1, label: 1 }).lean();

const listAll = (includeInactive) => {
  const filter = includeInactive ? {} : { isActive: true };
  return DocumentType.find(filter).sort({ sortOrder: 1, label: 1 }).lean();
};

const getById = async (id) => {
  const docType = await DocumentType.findById(id).lean();
  if (!docType) {
    throw new AppError(AUTH_MESSAGES.DOCUMENT_TYPE_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }
  return docType;
};

const create = async (body, adminId) => {
  const exists = await DocumentType.findOne({ key: body.key });
  if (exists) {
    throw new AppError(AUTH_MESSAGES.DOCUMENT_TYPE_KEY_EXISTS, HTTP_STATUS.CONFLICT, 'DOCUMENT_TYPE_EXISTS');
  }

  const docType = await DocumentType.create({
    key: body.key,
    ...pick(body, ALLOWED_UPDATE_FIELDS),
    createdBy: adminId,
  });

  auditService.log({ event: AUDIT_EVENTS.DOCUMENT_TYPE_CREATED, userId: adminId, metadata: { documentTypeId: docType._id, key: docType.key } }).catch(() => {});
  return docType;
};

const update = async (id, body, adminId) => {
  const docType = await DocumentType.findById(id);
  if (!docType) {
    throw new AppError(AUTH_MESSAGES.DOCUMENT_TYPE_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  Object.assign(docType, pick(body, ALLOWED_UPDATE_FIELDS));
  docType.updatedBy = adminId;
  await docType.save();

  auditService.log({ event: AUDIT_EVENTS.DOCUMENT_TYPE_UPDATED, userId: adminId, metadata: { documentTypeId: docType._id, key: docType.key } }).catch(() => {});
  return docType;
};

// Soft-deactivate only — never hard-delete a type that existing Documents/Jobs reference.
const deactivate = async (id, adminId) => {
  const docType = await DocumentType.findByIdAndUpdate(id, { $set: { isActive: false, updatedBy: adminId } }, { new: true });
  if (!docType) {
    throw new AppError(AUTH_MESSAGES.DOCUMENT_TYPE_NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  auditService.log({ event: AUDIT_EVENTS.DOCUMENT_TYPE_DEACTIVATED, userId: adminId, metadata: { documentTypeId: docType._id, key: docType.key } }).catch(() => {});
  return docType;
};

module.exports = {
  listActive,
  listAll,
  getById,
  create,
  update,
  deactivate,
};
