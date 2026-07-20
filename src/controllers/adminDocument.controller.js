'use strict';

const documentService = require('../services/document.service');
const auditService = require('../services/audit.service');
const asyncHandler = require('../utils/asyncHandler');
const { AUDIT_EVENTS } = require('../constants/audit');

// GET /admin/documents/:id/file — lets an admin review any applicant's
// submitted document (resume, passport, certificate, etc.) while reviewing an
// application. Every view is audit-logged since these are privacy-sensitive
// files (passports, medical certificates).
const getDocumentFile = asyncHandler(async (req, res) => {
  const doc = await documentService.getAdminDocumentFile(req.params.id);

  auditService
    .log({
      event: AUDIT_EVENTS.DOCUMENT_VIEWED_BY_ADMIN,
      userId: req.user._id,
      metadata: { documentId: req.params.id, ownerUserId: doc.ownerUserId },
    })
    .catch(() => {});

  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.originalName)}"`);
  return res.sendFile(doc.absolutePath);
});

module.exports = { getDocumentFile };
