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

/** Crop rectangles come from a client and are never assumed to be sane. */
const clamp01 = (n) => Math.min(Math.max(Number(n) || 0, 0), 1);

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

/**
 * Crops an image to a SQUARE and encodes it as WebP, keeping the subject.
 *
 * Written as its own function rather than another convertToWebp() call because
 * getting a square out of `cover` is not a matter of passing equal dimensions:
 *
 *   - `withoutEnlargement` with `fit: 'cover'` silently abandons the target
 *     when the source is smaller in either axis, so a 900x1200 upload came back
 *     900x1000 — not square at all. Every consumer (the app's circular frames,
 *     every PDF template) then re-crops it differently, which is precisely the
 *     inconsistency a single square master exists to prevent.
 *   - Dropping `withoutEnlargement` fixes the shape but upscales small uploads
 *     into fake resolution, which looks soft for no benefit.
 *
 * So the target is derived from the source instead: the largest square the
 * image can actually supply, capped at maxSize. Always square, never upscaled.
 *
 * `position: 'attention'` picks the region of highest visual interest — the
 * face, on a portrait — rather than assuming the subject is dead centre. Phone
 * portraits put the face in the upper third, so a centre crop reliably beheads
 * them.
 *
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {object} opts
 * @param {number} [opts.maxSize=1000] upper bound on the output edge
 * @param {number} [opts.quality=90]
 * @returns {Promise<number>} the edge length actually produced
 */
const convertToSquareWebp = async (inputPath, outputPath, { maxSize = 1000, quality = 90, crop = null } = {}) => {
  const meta = await sharp(inputPath, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  const srcW = meta.width || maxSize;
  const srcH = meta.height || maxSize;

  let pipeline = sharp(inputPath, { limitInputPixels: MAX_INPUT_PIXELS });
  let available = Math.min(srcW, srcH);

  // An explicit crop always wins over the automatic one. `attention` is a good
  // guess, but it is still a guess — when the person has told us which part of
  // their own photo to keep, guessing again would be worse than useless.
  //
  // Rectangles arrive normalised (0-1) rather than in pixels because the client
  // may be working from a downscaled preview, and because a fraction cannot go
  // stale if the source is re-encoded. Everything is clamped to the real
  // dimensions here: the crop is user input, so it is never trusted to be
  // in-bounds, and an out-of-range extract() throws rather than degrading.
  if (crop) {
    const left = Math.round(clamp01(crop.x) * srcW);
    const top = Math.round(clamp01(crop.y) * srcH);
    const maxW = Math.max(srcW - left, 1);
    const maxH = Math.max(srcH - top, 1);
    // Square in PIXELS, which is what the circular frame in the app shows —
    // so the two axes are reconciled here rather than trusting them to agree.
    const size = Math.max(Math.min(Math.round(clamp01(crop.width) * srcW), maxW, maxH), 1);

    pipeline = pipeline.extract({ left, top, width: size, height: size });
    available = size;
  }

  const edge = Math.max(Math.min(available, maxSize), 1);

  await pipeline
    .resize(edge, edge, crop ? { fit: 'fill' } : { fit: 'cover', position: 'attention' })
    .webp({ quality })
    .toFile(outputPath);

  return edge;
};

module.exports = { convertToWebp, convertToSquareWebp, MAX_INPUT_PIXELS };
