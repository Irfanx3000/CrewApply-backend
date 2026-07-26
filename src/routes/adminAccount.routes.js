'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/authorize.middleware');
const validate = require('../middleware/validate.middleware');
const { otpLimiter } = require('../middleware/rateLimiter.middleware');
const { ROLES } = require('../constants/roles');
const adminAccountController = require('../controllers/adminAccount.controller');
const adminAccountValidation = require('../validations/adminAccount.validation');

// Admin-only — inviting/listing fellow admins. The invite is accepted via a
// SEPARATE public endpoint (POST /auth/accept-admin-invite) since the invited
// person has no session yet — see auth.routes.js.
router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/', adminAccountController.listAdmins);
router.post('/invite', otpLimiter, validate(adminAccountValidation.inviteAdmin), adminAccountController.inviteAdmin);

module.exports = router;
