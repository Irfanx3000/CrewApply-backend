'use strict';

const sharp = require('sharp');

// ── Decompression-bomb ceiling ────────────────────────────────────────────────
//
// The file-size limits in upload.middleware.js do NOT bound how much memory an
// image costs to decode, because compression ratio is attacker-controlled. A
// solid-colour 14000x14000 PNG compresses to about 0.57 MB — comfortably under
// the 2 MB profile-photo cap — but decodes to 196 megapixels and makes libvips
// allocate roughly 750 MB of RGBA. One such request is enough to OOM-kill the
// API, which runs as a single PM2 process (see ecosystem.config.js), taking
// every other in-flight request down with it.
//
// sharp's own default ceiling is 0x3FFF^2 (~268 MP, ~1 GB) — far too permissive
// to be a defence here. This is the real bound.
//
// 50 MP was chosen against what actually reaches sharp. Only four paths do:
// profile photos (2 MB cap, the only user-controlled one), job images (5 MB),
// banners (5 MB) and category icons (2 MB) — all admin-uploaded. 50 MP is
// ~8600x5800, larger than any phone or camera photo that could fit inside a
// 2-5 MB JPEG at usable quality, so no legitimate upload is affected, while a
// bomb is rejected before a single byte is decoded. Documents (PDFs, scans,
// certificates) never pass through sharp at all, so high-DPI A4 scans — which
// genuinely can exceed 30 MP — are unaffected by this limit.
const MAX_INPUT_PIXELS = 50_000_000;

/**
 * Resizes an image and encodes it as WebP.
 *
 * @param {string} inputPath  - Absolute path to the source image (e.g. multer temp file).
 * @param {string} outputPath - Absolute path to write the resulting .webp file.
 * @param {object} opts
 * @param {number|object|Array} opts.resize - Passed straight to sharp's `.resize()`.
 *   A single number resizes width only; an array is spread as positional args
 *   (e.g. `[400, 400, { fit: 'cover' }]`); an object is passed as-is.
 * @param {number} [opts.quality=85]
 * @throws when the source exceeds MAX_INPUT_PIXELS — surfaced to the caller as a
 *   normal upload failure, exactly like an unreadable or wrong-format file.
 */
const convertToWebp = async (inputPath, outputPath, { resize, quality = 85 }) => {
  let pipeline = sharp(inputPath, { limitInputPixels: MAX_INPUT_PIXELS });
  pipeline = Array.isArray(resize) ? pipeline.resize(...resize) : pipeline.resize(resize);
  await pipeline.webp({ quality }).toFile(outputPath);
};

module.exports = { convertToWebp, MAX_INPUT_PIXELS };
