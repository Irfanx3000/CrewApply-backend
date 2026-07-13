'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const documentTypeController = require('../controllers/documentType.controller');

router.get('/', authenticate, documentTypeController.listActiveDocumentTypes);

module.exports = router;
