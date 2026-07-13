'use strict';

const express = require('express');
const router = express.Router();

const paymentController = require('../controllers/payment.controller');

// Razorpay server-to-server webhook. NO auth, NO validation, NO rate limiter —
// authenticity is proven by the HMAC signature over the raw body (verified in the
// service). req.rawBody is captured by the express.json `verify` hook in app.js.
router.post('/webhook', paymentController.webhook);

module.exports = router;
