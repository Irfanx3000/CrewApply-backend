'use strict';

const User = require('../models/user.model');
const documentService = require('./document.service');

// Read-through projections of data owned by OTHER domains (User, Document) —
// the single place the Career Profile Engine looks to assemble its
// "aggregated" sections (Personal/Contact/Maritime/Certificates/Travel docs).
// Nothing here is ever copied into CareerProfile; every call reads live, so
// an edit made once (e.g. a phone number in Personal Info) is correct
// everywhere — the profile screen, every resume, a future recruiter view —
// with no "refresh" step and no staleness possible.
//
// Kept deliberately narrow: each function returns only the CV-relevant slice
// of its owning domain, not the raw Mongoose document. This is what keeps
// CareerProfile's coupling to User/Document at a stable interface rather
// than their internal schema shape (see architecture doc, self-critique #1).

const getPersonalSection = async (userId) => {
  const u = await User.findById(userId).lean();
  if (!u) return null;
  return {
    fullName: u.name,
    avatarUrl: u.avatar,
    dateOfBirth: u.dateOfBirth,
    gender: u.gender,
    nationality: u.nationality,
    maritalStatus: u.maritalStatus,
  };
};

const getContactSection = async (userId) => {
  const u = await User.findById(userId).lean();
  if (!u) return null;
  return {
    email: u.email,
    phone: u.phone,
    alternatePhone: u.alternatePhone,
    currentLocation: u.currentLocation,
    city: u.city,
    state: u.state,
    country: u.country,
  };
};

const getMaritimeSection = async (userId) => {
  const u = await User.findById(userId).lean();
  return u?.maritimeProfile || null;
};

// Verified === actually backed by an uploaded, active Document — distinct
// from anything a user could just type, and surfaced as a "Verified ✓" badge
// wherever certificates are shown.
const getVerifiedCertificates = async (userId) => {
  const docs = await documentService.getCertificates(userId);
  return docs.map((doc) => ({
    sourceDocumentId: doc._id,
    name: doc.type || doc.category,
    issuingAuthority: doc.metadata?.issuingAuthority || null,
    issueDate: doc.metadata?.issueDate || null,
    expiryDate: doc.metadata?.expiryDate || null,
    verified: true,
  }));
};

// Passport/CDC/Medical/Visa — useful for a "Travel & Deployment Readiness"
// section recruiters care about; also read-only here, edited via the
// existing Documents flow.
const getTravelDocuments = async (userId) => {
  const [passport, cdc, medical, visa] = await Promise.all([
    documentService.getPassport(userId),
    documentService.getCdc(userId),
    documentService.getMedical(userId),
    documentService.getVisa(userId),
  ]);

  return {
    passport: passport ? { number: passport.metadata?.passportNumber || null, expiryDate: passport.metadata?.expiryDate || null, verified: true } : null,
    cdc: cdc ? { number: cdc.metadata?.cdcNumber || null, verified: true } : null,
    medical: medical ? { expiryDate: medical.metadata?.expiryDate || null, verified: true } : null,
    visa: (visa || []).map((v) => ({ country: v.metadata?.country || null, visaNumber: v.metadata?.visaNumber || null, expiryDate: v.metadata?.expiryDate || null, verified: true })),
  };
};

// Convenience: everything aggregated, in one call — used by both the Career
// Profile screen (GET /user/career-profile) and the resume composer.
const getAggregatedProfile = async (userId) => {
  const [personal, contact, maritime, certificates, travelDocuments] = await Promise.all([
    getPersonalSection(userId),
    getContactSection(userId),
    getMaritimeSection(userId),
    getVerifiedCertificates(userId),
    getTravelDocuments(userId),
  ]);

  return { personal, contact, maritime, certificates, travelDocuments };
};

module.exports = {
  getPersonalSection,
  getContactSection,
  getMaritimeSection,
  getVerifiedCertificates,
  getTravelDocuments,
  getAggregatedProfile,
};
