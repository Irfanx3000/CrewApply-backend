'use strict';

// Gathers the right data for a specific resume render — separated from
// buildDocumentModel's "lay it out as blocks" responsibility so a future
// Recruiter Profile View can reuse this same resolution with a different
// visibility filter, without touching the rendering layer at all.
//
// Filters CareerProfile's native arrays down to only the entries selected
// on this ResumeConfiguration (by _id), merges in the live-aggregated
// sections, and applies the per-resume objective override. Returns a single
// self-contained content object — buildDocumentModel() never needs to know
// about CareerProfile/ResumeConfiguration/aggregation at all.

const byIds = (entries, ids) => {
  if (!ids?.length) return [];
  const idSet = new Set(ids.map(String));
  return (entries || []).filter((e) => idSet.has(String(e._id)));
};

const resolveContent = (careerProfile, resumeConfig, aggregated) => {
  return {
    personal: aggregated.personal,
    contact: aggregated.contact,
    maritime: aggregated.maritime,
    certificates: aggregated.certificates,
    travelDocuments: aggregated.travelDocuments,

    careerObjective: careerProfile.careerObjective,
    objectiveOverride: resumeConfig.objectiveOverride,

    experience: byIds(careerProfile.experience, resumeConfig.selection?.experienceIds),
    education: byIds(careerProfile.education, resumeConfig.selection?.educationIds),
    skills: byIds(careerProfile.skills, resumeConfig.selection?.skillIds),
    languages: byIds(careerProfile.languages, resumeConfig.selection?.languageIds),
    references: resumeConfig.visibility?.showReferences
      ? byIds(careerProfile.references, resumeConfig.selection?.referenceIds)
      : [],
    customSections: careerProfile.customSections || [],
  };
};

module.exports = { resolveContent };
