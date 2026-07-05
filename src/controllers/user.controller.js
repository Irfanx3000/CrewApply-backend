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

  // Normalize DD-MM-YYYY → Date so Mongoose casts it correctly (new Date() can't
  // parse DD-MM-YYYY). ISO strings pass through untouched.
  if (typeof updates.dateOfBirth === 'string') {
    const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(updates.dateOfBirth);
    if (m) updates.dateOfBirth = new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`);
  }

  // Allow clearing the profile photo. Only null/empty is accepted — a user
  // cannot point their avatar at an arbitrary path.
  if (req.body.avatar === null || req.body.avatar === '') {
    updates.avatar = null;
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
    avatar: user.avatar,
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

  const user = await User.findById(req.user._id);

  if (!user) {
    throw new AppError(AUTH_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED, 'UNAUTHORIZED');
  }

  // maritimeProfile defaults to null — initialize it so nested fields can be set
  // (a `$set` of `maritimeProfile.department` fails when the parent is null).
  if (!user.maritimeProfile) {
    user.maritimeProfile = {};
  }

  for (const field of ALLOWED_MARITIME) {
    if (req.body[field] !== undefined) {
      user.maritimeProfile[field] = req.body[field] || null;
    }
  }

  user.onboardingCompleted = true;

  // Validate only the paths we touched — avoids re-validating unrelated fields
  // (e.g. password, which isn't loaded here).
  await user.save({ validateModifiedOnly: true });

  return successResponse(res, AUTH_MESSAGES.MARITIME_PROFILE_UPDATED, {
    onboardingCompleted: user.onboardingCompleted,
    maritimeProfile: user.maritimeProfile,
  });
});

module.exports = { getProfile, updateProfile, updateMaritimeProfile };
