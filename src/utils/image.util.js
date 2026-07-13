'use strict';

const sharp = require('sharp');

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
 */
const convertToWebp = async (inputPath, outputPath, { resize, quality = 85 }) => {
  let pipeline = sharp(inputPath);
  pipeline = Array.isArray(resize) ? pipeline.resize(...resize) : pipeline.resize(resize);
  await pipeline.webp({ quality }).toFile(outputPath);
};

module.exports = { convertToWebp };
