'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/authorize.middleware');
const validate = require('../middleware/validate.middleware');
const { ROLES } = require('../constants/roles');
const adminDocumentTypeController = require('../controllers/adminDocumentType.controller');
const documentTypeValidation = require('../validations/documentType.validation');

// Admin-only document-type (category) management. Tested via Postman with an
// admin token until the admin panel exists — mirrors adminPlan.routes.js.
router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/', validate(documentTypeValidation.listQuery), adminDocumentTypeController.listAdminDocumentTypes);
router.post('/', validate(documentTypeValidation.createDocumentType), adminDocumentTypeController.createDocumentType);
router.get('/:id', validate(documentTypeValidation.documentTypeIdParam), adminDocumentTypeController.getAdminDocumentTypeById);
router.patch('/:id', validate([...documentTypeValidation.documentTypeIdParam, ...documentTypeValidation.updateDocumentType]), adminDocumentTypeController.updateDocumentType);
router.delete('/:id', validate(documentTypeValidation.documentTypeIdParam), adminDocumentTypeController.deactivateDocumentType);

module.exports = router;
