'use strict';

const mongoose = require('mongoose');

// A named, tailored resume ("Chief Officer Resume", "Offshore Resume"). Owns
// NO content of its own — only a selection/override layer referencing the
// user's single CareerProfile. This is the corrected design from the first
// draft (which mistakenly let each "Resume" own copies of experience/
// education arrays): all real content lives in exactly one place
// (CareerProfile); a user can have many of these without ever duplicating data.

const resumeConfigurationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    careerProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CareerProfile',
      required: true,
    },

    title: { type: String, required: [true, 'Title is required.'], trim: true, maxlength: 100 },

    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ResumeTemplate',
      required: true,
    },

    // Overrides CareerProfile.careerObjective for this resume only — leaves
    // the base objective untouched for other resumes. null = use the base.
    objectiveOverride: { type: String, trim: true, default: null, maxlength: 1000 },

    // Which CareerProfile subdocuments (by _id) to include on THIS resume.
    // Populated with everything that exists at creation time (a snapshot of
    // "what's available now"), then curated by the user — a later addition
    // to the CareerProfile does NOT automatically appear on an existing
    // resume; the user opts it in explicitly. See architecture doc
    // self-critique #4.
    selection: {
      experienceIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
      educationIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
      skillIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
      languageIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
      referenceIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    },

    visibility: {
      showPhoto: { type: Boolean, default: true },
      showReferences: { type: Boolean, default: false },
    },

    metadata: {
      lastGeneratedAt: { type: Date, default: null },
      lastGeneratedDocumentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
      generatedDocumentIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'Document', default: [] },
      // Hash of the resolved content at the moment of the last successful
      // generation — compared against a freshly-resolved hash to power the
      // non-blocking "profile changed since generation — regenerate?" nudge,
      // without needing to diff full documents.
      contentHashAtLastGeneration: { type: String, default: null },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

resumeConfigurationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('ResumeConfiguration', resumeConfigurationSchema);
