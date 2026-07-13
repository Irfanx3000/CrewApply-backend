'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/apiResponse');
const documentTypeService = require('../services/documentType.service');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

// All admin-only (guarded by authorize(ROLES.ADMIN) in the route).

const listAdminDocumentTypes = asyncHandler(async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true';
  const documentTypes = await documentTypeService.listAll(includeInactive);
  return successResponse(res, AUTH_MESSAGES.DOCUMENT_TYPES_FETCHED, { documentTypes });
});

const getAdminDocumentTypeById = asyncHandler(async (req, res) => {
  const documentType = await documentTypeService.getById(req.params.id);
  return successResponse(res, AUTH_MESSAGES.DOCUMENT_TYPE_FETCHED, { documentType });
});

const createDocumentType = asyncHandler(async (req, res) => {
  const documentType = await documentTypeService.create(req.body, req.user._id);
  return successResponse(res, AUTH_MESSAGES.DOCUMENT_TYPE_CREATED, { documentType }, HTTP_STATUS.CREATED);
});

const updateDocumentType = asyncHandler(async (req, res) => {
  const documentType = await documentTypeService.update(req.params.id, req.body, req.user._id);
  return successResponse(res, AUTH_MESSAGES.DOCUMENT_TYPE_UPDATED, { documentType });
});

const deactivateDocumentType = asyncHandler(async (req, res) => {
  const documentType = await documentTypeService.deactivate(req.params.id, req.user._id);
  return successResponse(res, AUTH_MESSAGES.DOCUMENT_TYPE_DEACTIVATED, { documentType });
});

module.exports = {
  listAdminDocumentTypes,
  getAdminDocumentTypeById,
  createDocumentType,
  updateDocumentType,
  deactivateDocumentType,
};
