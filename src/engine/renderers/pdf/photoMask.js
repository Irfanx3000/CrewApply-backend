'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

// pdfmake can place an image but cannot clip one — there is no border-radius
// and no clipping path in its content vocabulary. A circular avatar therefore
// has to arrive already circular, so this bakes the mask into a PNG with a
// transparent corner alpha before the image ever reaches the renderer.
//
// sharp is already a dependency (utils/image.util.js uses it for profile photo
// and document conversion), so this adds no new install.
//
// Results are cached on disk keyed by source path + mtime + size, because a
// resume is re-rendered every time the user taps Save & Download and re-masking
// the same avatar each time is pure waste. A cache miss (or any failure at all)
// degrades to "no photo" rather than failing the render — a resume without an
// avatar is still a perfectly good document.

// src/engine/renderers/pdf -> src/, matching storage.service.js's UPLOADS_ROOT
// (the physical folders live under src/uploads, not the project root).
const CACHE_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'cache', 'resume-photos');

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Masks an image into a circle (optionally with a solid ring) and returns the
 * absolute path of the resulting PNG.
 *
 * @param {string} absoluteSourcePath
 * @param {object} opts
 * @param {number} opts.size        output diameter in px (render at 3x the pt
 *                                  size so it stays crisp when embedded)
 * @param {number} [opts.ringWidth] ring thickness in px, 0 for none
 * @param {string} [opts.ringColor]
 * @returns {Promise<string|null>} path, or null if anything went wrong
 */
async function circularPhoto(absoluteSourcePath, { size = 180, ringWidth = 0, ringColor = '#FFFFFF' } = {}) {
  try {
    if (!absoluteSourcePath || !fs.existsSync(absoluteSourcePath)) return null;
    ensureCacheDir();

    const stat = fs.statSync(absoluteSourcePath);
    const key = crypto
      .createHash('sha1')
      .update(`${absoluteSourcePath}|${stat.mtimeMs}|${stat.size}|${size}|${ringWidth}|${ringColor}`)
      .digest('hex');
    const outPath = path.join(CACHE_DIR, `${key}.png`);
    if (fs.existsSync(outPath)) return outPath;

    const r = size / 2;
    // Two-part overlay: the circle itself is the alpha mask (dest-in keeps
    // only what falls inside it); the ring is stroked on top afterwards.
    const maskSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`
    );

    const composites = [{ input: maskSvg, blend: 'dest-in' }];
    if (ringWidth > 0) {
      const ringSvg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r - ringWidth / 2}" fill="none" stroke="${ringColor}" stroke-width="${ringWidth}"/></svg>`
      );
      composites.push({ input: ringSvg, blend: 'over' });
    }

    await sharp(absoluteSourcePath)
      .resize(size, size, { fit: 'cover', position: 'attention' })
      .composite(composites)
      .png()
      .toFile(outPath);

    return outPath;
  } catch {
    return null;
  }
}

module.exports = { circularPhoto };
