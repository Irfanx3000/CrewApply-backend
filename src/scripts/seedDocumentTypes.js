'use strict';

// Seed the 9 document types that previously lived as a hardcoded enum
// (Document.DOCUMENT_CATEGORIES). Preserves today's exact multer limits and the
// profile_photo/others job-requirement exclusion, now expressed as data.
// Re-runnable (upsert by key). Admin can edit/add more later via
// PATCH/POST /api/v1/admin/document-types.
//
//   node src/scripts/seedDocumentTypes.js

require('dotenv').config();
const mongoose = require('mongoose');
const DocumentType = require('../models/documentType.model');

// [ key, label, description, acceptedFileTypes, maxSizeMB, allowMultiple, isRequirableForJob, icon, sortOrder ]
const ROWS = [
  ['resume', 'Resume / CV', 'Your latest resume or curriculum vitae.', 'pdf', 5, false, true, 'file-alt', 10],
  ['certificate', 'Certificate', 'Professional training or competency certificates.', 'both', 10, true, true, 'certificate', 20],
  ['stcw', 'STCW Certificate', 'Safety Training Certificate (STCW).', 'both', 10, true, true, 'certificate', 30],
  ['passport', 'Passport', 'Valid passport copy.', 'both', 10, false, true, 'id-card', 40],
  ['cdc', 'CDC', 'Continuous Discharge Certificate.', 'both', 10, false, true, 'id-card', 50],
  ['medical', 'Medical Certificate', 'Medical fitness certificate.', 'both', 10, false, true, 'briefcase', 60],
  ['visa', 'Visa', 'Valid visa documents.', 'both', 10, true, true, 'globe', 70],
  ['profile_photo', 'Profile Photo', 'Passport-size profile photo.', 'image', 2, false, false, 'user', 80],
  ['others', 'Other Document', 'Any other supporting document.', 'both', 10, true, false, 'file-alt', 90],
];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  let n = 0;
  for (const [key, label, description, acceptedFileTypes, maxSizeMB, allowMultiple, isRequirableForJob, icon, sortOrder] of ROWS) {
    await DocumentType.findOneAndUpdate(
      { key },
      {
        $set: {
          key, label, description, acceptedFileTypes, maxSizeMB,
          allowMultiple, isRequirableForJob, icon, isActive: true, sortOrder,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    n += 1;
    console.log(`  ✓ ${label} (${key})`);
  }
  console.log(`Seeded/updated ${n} document types.`);
  await mongoose.disconnect();
})().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
