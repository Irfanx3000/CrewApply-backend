'use strict';

const express = require('express');
const router = express.Router();

const walletController = require('../controllers/wallet.controller');
const walletValidation = require('../validations/wallet.validation');
const validate = require('../middleware/validate.middleware');
const authenticate = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/', walletController.getWallet);
router.get('/history', validate(walletValidation.listHistoryQuery), walletController.getHistory);
router.get('/:id', validate(walletValidation.transactionIdParam), walletController.getTransactionById);

module.exports = router;
