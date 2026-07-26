'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/authorize.middleware');
const validate = require('../middleware/validate.middleware');
const { bannerImageUpload } = require('../middleware/upload.middleware');
const { ROLES } = require('../constants/roles');
const adminBannerController = require('../controllers/adminBanner.controller');
const bannerValidation = require('../validations/banner.validation');

router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/', adminBannerController.listAdminBanners);
router.post('/', validate(bannerValidation.createBanner), adminBannerController.createBanner);
router.post('/upload-image', bannerImageUpload.single('file'), adminBannerController.uploadImage);
router.patch('/:id', validate([...bannerValidation.bannerIdParam, ...bannerValidation.updateBanner]), adminBannerController.updateBanner);
router.delete('/:id', validate(bannerValidation.bannerIdParam), adminBannerController.deleteBanner);

module.exports = router;
