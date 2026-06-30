'use strict';

const User = require('../models/user.model');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/apiResponse');
const { AUTH_MESSAGES } = require('../constants/messages');
const { HTTP_STATUS } = require('../constants/httpStatus');
const AppError = require('../utils/AppError');
const { computeProfileCompletion } = require('../services/document.service');

// ── GET /user/profile ─────────────────────────────────────────────────────────

const getProfile = asyncHandler(async (req, res) => {
  const u = req.user;

  const profileCompletion = await computeProfileCompletion(u);

  return successResponse(res, 'Profile fetched successfully.', {
    id: u._id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    avatar: u.avatar,
    // Verification status
    emailVerified: u.emailVerified,
    phoneVerified: u.phoneVerified,
    // Personal info
    dateOfBirth: u.dateOfBirth,
    gender: u.gender,
    nationality: u.nationality,
    country: u.country,
    state: u.state,
    city: u.city,
    maritalStatus: u.maritalStatus,
    alternatePhone: u.alternatePhone,
    currentLocation: u.currentLocation,
    // Onboarding
    onboardingCompleted: u.onboardingCompleted,
    maritimeProfile: u.maritimeProfile,
    // Computed
    profileCompletion,
    // Timestamps
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  });
});

// ── PATCH /user/profile ───────────────────────────────────────────────────────

const updateProfile = asyncHandler(async (req, res) => {
  const ALLOWED = [
    'name', 'dateOfBirth', 'gender',
    'nationality', 'country', 'state', 'city',
    'maritalStatus', 'alternatePhone', 'currentLocation',
  ];

  const updates = {};
  for (const field of ALLOWED) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError('No valid fields provided for update.', HTTP_STATUS.BAD_REQUEST, 'NO_FIELDS');
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (!user) {
    throw new AppError(AUTH_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED, 'UNAUTHORIZED');
  }

  return successResponse(res, AUTH_MESSAGES.PROFILE_UPDATED, {
    id: user._id,
    name: user.name,
    dateOfBirth: user.dateOfBirth,
    gender: user.gender,
    nationality: user.nationality,
    country: user.country,
    state: user.state,
    city: user.city,
    maritalStatus: user.maritalStatus,
    alternatePhone: user.alternatePhone,
    currentLocation: user.currentLocation,
  });
});

// ── PATCH /user/maritime-profile ──────────────────────────────────────────────

const updateMaritimeProfile = asyncHandler(async (req, res) => {
  const ALLOWED_MARITIME = [
    'department', 'rank', 'designation',
    'experienceStartDate', 'experienceEndDate',
    'certificatesSummary', 'currentVessel', 'preferredVessel',
    'preferredRank', 'seaExperienceYears', 'licenseNumbers',
    'medicalExpiry', 'passportExpiry', 'cdcNumber', 'availabilityDate',
  ];

  const maritimeUpdates = {};
  for (const field of ALLOWED_MARITIME) {
    if (req.body[field] !== undefined) {
      maritimeUpdates[`maritimeProfile.${field}`] = req.body[field] || null;
    }
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { ...maritimeUpdates, onboardingCompleted: true } },
    { new: true, runValidators: false }
  );

  if (!user) {
    throw new AppError(AUTH_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED, 'UNAUTHORIZED');
  }

  return successResponse(res, AUTH_MESSAGES.MARITIME_PROFILE_UPDATED, {
    onboardingCompleted: user.onboardingCompleted,
    maritimeProfile: user.maritimeProfile,
  });
});

module.exports = { getProfile, updateProfile, updateMaritimeProfile };
