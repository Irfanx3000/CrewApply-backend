'use strict';

const express = require('express');
const router = express.Router();

const bannerController = require('../controllers/banner.controller');

// Public — no auth. The mobile app fetches active banners before login exists
// on some screens, and there's nothing user-specific about a promo banner.
router.get('/', bannerController.listBanners);

module.exports = router;
