'use strict';

const fs = require('fs/promises');
const path = require('path');
const cron = require('node-cron');
const { UPLOADS_ROOT } = require('../services/storage.service');

// ── Orphaned upload sweep ─────────────────────────────────────────────────────
//
// Every upload lands in uploads/temp first, and every SUCCESSFUL path moves or
// deletes it: storage.saveFile() renames it to its final directory, the image
// paths call deleteTempFile() after conversion, and uploadGuard's magic-byte
// check deletes it on a rejected file type. So the happy paths and the
// validation paths are already clean.
//
// What is not covered is the request that never reaches any of them: a phone
// that loses signal mid-upload, an app killed while a certificate is
// transferring, a client that hangs up after the headers. multer has already
// written a partial file to temp by that point, and nothing downstream ever
// runs to remove it. Each orphan is up to 20 MB (the largest configured
// upload) and it stays forever, so disk consumption grows at exactly the rate
// uploads fail — which is highest on the mobile networks most of these users
// are on.
//
// Deliberately a filesystem sweep and not a tracked-state cleanup: there is no
// record of an aborted upload to consult, and the temp directory's only
// legitimate contents are in-flight files.

// Comfortably longer than any single upload can take. Nginx caps the body at
// 15 MB and proxy_read_timeout at 60s, so an hour cannot strand a live
// request — while still bounding how long an orphan survives.
const MAX_TEMP_AGE_MS = 60 * 60 * 1000;

// Hourly. The volume is tiny (one readdir over a directory that should be
// near-empty), and matching the cadence to the age threshold means an orphan
// lives at most two hours.
const SCHEDULE = '15 * * * *';

const tempDir = () => path.join(UPLOADS_ROOT, 'temp');

/**
 * Deletes files in uploads/temp older than MAX_TEMP_AGE_MS.
 * Never throws — a sweep failure must not affect anything else.
 *
 * @returns {Promise<{ removed: number, bytes: number, failed: number }>}
 */
const runTempSweep = async () => {
  const dir = tempDir();
  const result = { removed: 0, bytes: 0, failed: 0 };

  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch {
    // Directory missing (fresh checkout before storage.service creates it) —
    // nothing to do, and not worth logging every hour.
    return result;
  }

  const cutoff = Date.now() - MAX_TEMP_AGE_MS;

  for (const name of entries) {
    const full = path.join(dir, name);
    try {
      const stat = await fs.stat(full);
      if (!stat.isFile() || stat.mtimeMs >= cutoff) continue;
      await fs.unlink(full);
      result.removed += 1;
      result.bytes += stat.size;
    } catch {
      // Almost always a race with an upload that finished between readdir and
      // stat/unlink, which is the correct outcome anyway. Counted, not logged
      // per-file, so a transient permissions problem cannot flood the log.
      result.failed += 1;
    }
  }

  if (result.removed > 0) {
    console.log(
      `TempSweep: removed ${result.removed} orphaned upload(s), ` +
      `${(result.bytes / 1024 / 1024).toFixed(2)} MB reclaimed` +
      (result.failed ? ` (${result.failed} skipped)` : '')
    );
  }

  return result;
};

const start = () => {
  cron.schedule(SCHEDULE, () => {
    runTempSweep().catch((err) => console.error('TempSweep: sweep failed:', err.message));
  });
};

module.exports = { start, runTempSweep, MAX_TEMP_AGE_MS };
