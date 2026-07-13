'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/apiResponse');
const documentTypeService = require('../services/documentType.service');
const { AUTH_MESSAGES } = require('../constants/messages');

// Public (authenticated) — only currently active document types.
const listActiveDocumentTypes = asyncHandler(async (req, res) => {
  const documentTypes = await documentTypeService.listActive();
  return successResponse(res, AUTH_MESSAGES.DOCUMENT_TYPES_FETCHED, { documentTypes });
});

module.exports = { listActiveDocumentTypes };
