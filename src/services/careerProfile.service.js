'use strict';

const CareerProfile = require('../models/careerProfile.model');
const { ARRAY_FIELDS } = CareerProfile;
const aggregation = require('./careerProfileAggregation.service');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

// Native-section CRUD + completion scoring for the Career Profile — the one
// piece of CV-adjacent data this platform actually owns directly. Aggregated
// sections (Personal/Contact/Maritime/Certificates/Travel docs) are never
// written here; they're read live via careerProfileAggregation.service.js
// and only ever fed INTO the completion calculation below.

// Illustrative weights — deliberately isolated in one function so they're
// easy to tune, and a natural candidate to move to an admin-editable config
// later (see architecture doc, self-critique #3) without touching callers.
const SECTION_WEIGHTS = Object.freeze({
  personal: 15,
  contact: 10,
  maritime: 20,
  experience: 20,
  certificates: 15,
  education: 10,
  skills: 5,
  languages: 3,
  references: 2,
});

const ratio = (filled, total) => (total === 0 ? 0 : Math.round((filled / total) * 100));
const capped = (count, target) => Math.round(Math.min(count / target, 1) * 100);

const scorePersonal = (personal) => {
  if (!personal) return 0;
  const fields = [personal.fullName, personal.avatarUrl, personal.dateOfBirth, personal.gender, personal.nationality, personal.maritalStatus];
  return ratio(fields.filter(Boolean).length, fields.length);
};

const scoreContact = (contact) => {
  if (!contact) return 0;
  const fields = [contact.email, contact.phone, contact.currentLocation || contact.city, contact.country];
  return ratio(fields.filter(Boolean).length, fields.length);
};

const scoreMaritime = (maritime) => {
  if (!maritime) return 0;
  const fields = [maritime.department, maritime.rank, maritime.seaExperienceYears, maritime.currentVessel];
  return ratio(fields.filter(Boolean).length, fields.length);
};

// One documented certificate is a start; three or more reads as "complete."
const scoreCertificates = (certificates) => capped(certificates?.length || 0, 3);
const scoreExperience = (native) => capped(native.experience?.length || 0, 2);
const scoreEducation = (native) => capped(native.education?.length || 0, 1);
const scoreSkills = (native) => capped(native.skills?.length || 0, 5);
const scoreLanguages = (native) => capped(native.languages?.length || 0, 2);
const scoreReferences = (native) => capped(native.references?.length || 0, 1);

const computeCompletion = (native, aggregated) => {
  const sections = {
    personal: scorePersonal(aggregated.personal),
    contact: scoreContact(aggregated.contact),
    maritime: scoreMaritime(aggregated.maritime),
    certificates: scoreCertificates(aggregated.certificates),
    experience: scoreExperience(native),
    education: scoreEducation(native),
    skills: scoreSkills(native),
    languages: scoreLanguages(native),
    references: scoreReferences(native),
  };

  const totalWeight = Object.values(SECTION_WEIGHTS).reduce((a, b) => a + b, 0);
  const weightedSum = Object.entries(sections).reduce(
    (sum, [key, score]) => sum + score * SECTION_WEIGHTS[key],
    0
  );

  return { overall: Math.round(weightedSum / totalWeight), sections };
};

// Every user gets exactly one CareerProfile — created lazily on first touch
// rather than at registration, so onboarding stays unchanged.
const getOrCreate = async (userId) => {
  let profile = await CareerProfile.findOne({ user: userId });
  if (!profile) {
    profile = await CareerProfile.create({ user: userId });
  }
  return profile;
};

// The fully resolved profile: native CareerProfile fields + live-aggregated
// sections + freshly computed completion. This is the single shape both the
// mobile Career Profile screen and (later) a recruiter view consume.
const getResolvedProfile = async (userId) => {
  const [profile, aggregated] = await Promise.all([
    getOrCreate(userId),
    aggregation.getAggregatedProfile(userId),
  ]);

  const completion = computeCompletion(profile, aggregated);

  // Write-through cache so other reads (e.g. the resume composer, or a list
  // of resumes showing "profile 82% complete") don't need to recompute.
  profile.completion = { ...completion, computedAt: new Date() };
  await profile.save();

  return {
    id: profile._id,
    careerObjective: profile.careerObjective,
    experience: profile.experience,
    education: profile.education,
    skills: profile.skills,
    languages: profile.languages,
    references: profile.references,
    customSections: profile.customSections,
    personal: aggregated.personal,
    contact: aggregated.contact,
    maritime: aggregated.maritime,
    certificates: aggregated.certificates,
    travelDocuments: aggregated.travelDocuments,
    completion,
    updatedAt: profile.updatedAt,
  };
};

const updateCareerObjective = async (userId, careerObjective) => {
  const profile = await getOrCreate(userId);
  profile.careerObjective = careerObjective || null;
  await profile.save();
  return profile;
};

const addEntry = async (userId, field, data) => {
  if (!ARRAY_FIELDS.includes(field)) {
    throw new AppError('Invalid career profile section.', HTTP_STATUS.BAD_REQUEST, 'INVALID_SECTION');
  }
  const profile = await getOrCreate(userId);
  profile[field].push(data);
  await profile.save();
  return profile[field][profile[field].length - 1];
};

const updateEntry = async (userId, field, entryId, data) => {
  if (!ARRAY_FIELDS.includes(field)) {
    throw new AppError('Invalid career profile section.', HTTP_STATUS.BAD_REQUEST, 'INVALID_SECTION');
  }
  const profile = await getOrCreate(userId);
  const entry = profile[field].id(entryId);
  if (!entry) {
    throw new AppError(AUTH_MESSAGES.NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }
  Object.assign(entry, data);
  await profile.save();
  return entry;
};

const removeEntry = async (userId, field, entryId) => {
  if (!ARRAY_FIELDS.includes(field)) {
    throw new AppError('Invalid career profile section.', HTTP_STATUS.BAD_REQUEST, 'INVALID_SECTION');
  }
  const profile = await getOrCreate(userId);
  const entry = profile[field].id(entryId);
  if (!entry) {
    throw new AppError(AUTH_MESSAGES.NOT_FOUND, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }
  profile[field].pull(entryId);
  await profile.save();
};

module.exports = {
  ARRAY_FIELDS,
  getOrCreate,
  getResolvedProfile,
  updateCareerObjective,
  addEntry,
  updateEntry,
  removeEntry,
  computeCompletion,
};
