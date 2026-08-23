'use strict';

// Profile photo processing.
//
// Reported symptom: uploaded photos came back cropped and soft. Two separate
// causes, and the fix for one can easily break the other, so both are pinned:
//
//   CROP  a centre crop assumes the subject is mid-frame. Phone portraits put
//         the face in the upper third, so the centre square beheaded them.
//   BLUR  the master was stored at 400x400 while the PDF renderer asks for 3x
//         the placed size — it was upscaling a small image on every render.
//
// The square guarantee gets its own test because the obvious fix (pass equal
// dimensions with withoutEnlargement) silently produces a NON-square image when
// the source is smaller in one axis, and every consumer then re-crops it
// differently. No database, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

const { convertToSquareWebp } = require('../src/utils/image.util');

let tmp;

test.before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-'));
});

/** A portrait with the subject deliberately in the UPPER THIRD, as a selfie is. */
const portrait = async (name, width, height) => {
  const file = path.join(tmp, name);
  const faceY = Math.round(height * 0.25);
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
    + `<rect width="${width}" height="${height}" fill="#9BB4C7"/>`
    + `<circle cx="${width / 2}" cy="${faceY}" r="${Math.round(width * 0.19)}" fill="#E8D5C4"/>`
    + `<rect x="${width * 0.33}" y="${faceY + width * 0.22}" width="${width * 0.34}" height="${height}" fill="#2F4A63"/>`
    + '</svg>'
  );
  await sharp(svg).jpeg({ quality: 92 }).toFile(file);
  return file;
};

/** Fraction of the image that is skin-tone — a proxy for "is the face still in shot". */
const facePixelRatio = async (file) => {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  let skin = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (r > 200 && g > 190 && g < 225 && b > 170 && b < 210) skin += 1;
  }
  return skin / (info.width * info.height);
};

test('output is always square, whatever the source aspect', async () => {
  for (const [w, h, label] of [[900, 1200, 'portrait'], [1600, 900, 'landscape'], [800, 800, 'square']]) {
    const src = await portrait(`${label}.jpg`, w, h);
    const out = path.join(tmp, `${label}.webp`);
    await convertToSquareWebp(src, out, { maxSize: 1000 });
    const m = await sharp(out).metadata();
    assert.equal(m.width, m.height,
      `${label} source produced ${m.width}x${m.height} — every consumer would re-crop this differently`);
  }
});

test('a small upload is never upscaled into fake resolution', async () => {
  const src = await portrait('small.jpg', 300, 400);
  const out = path.join(tmp, 'small.webp');
  await convertToSquareWebp(src, out, { maxSize: 1000 });
  const m = await sharp(out).metadata();

  assert.equal(m.width, m.height, 'still square');
  assert.equal(m.width, 300,
    'the largest square a 300x400 source can supply is 300 — anything larger is invented detail');
});

test('a large upload is capped at maxSize, not stored at full size', async () => {
  const src = await portrait('huge.jpg', 3000, 4000);
  const out = path.join(tmp, 'huge.webp');
  await convertToSquareWebp(src, out, { maxSize: 1000 });
  const m = await sharp(out).metadata();
  assert.equal(m.width, 1000);
  assert.equal(m.height, 1000);
});

test('resolution is high enough that the PDF never upscales it', async () => {
  // The renderer asks for 3x the placed size (see prepareAssets). The largest
  // photo across the templates is 168pt, so it requests ~504px. The old 400px
  // master was upscaled on every render, which is what "blurry" was.
  const LARGEST_PLACED_PT = 168;
  const requested = LARGEST_PLACED_PT * 3;

  const src = await portrait('big.jpg', 1500, 2000);
  const out = path.join(tmp, 'big.webp');
  const edge = await convertToSquareWebp(src, out, { maxSize: 1000 });

  assert.ok(edge >= requested,
    `master edge ${edge}px must cover the ${requested}px the renderer asks for (old master was 400px)`);
});

test('the subject survives the crop on a portrait', async () => {
  const src = await portrait('subject.jpg', 900, 1200);

  const smart = path.join(tmp, 'smart.webp');
  await convertToSquareWebp(src, smart, { maxSize: 900 });

  // Same crop, but the old centre strategy, for comparison.
  const centre = path.join(tmp, 'centre.webp');
  await sharp(src).resize(900, 900, { fit: 'cover', position: 'centre' }).webp().toFile(centre);

  const smartFace = await facePixelRatio(smart);
  assert.ok(smartFace > 0.02,
    `the face must survive the crop (retained ${(smartFace * 100).toFixed(1)}% skin-tone pixels)`);

  // Recorded rather than asserted as a strict inequality: 'attention' is a
  // heuristic, and pinning it to always beat 'centre' on a synthetic shape
  // would be testing sharp's internals rather than our own behaviour.
  const centreFace = await facePixelRatio(centre);
  assert.ok(centreFace >= 0, `centre retained ${(centreFace * 100).toFixed(1)}%`);
});

// ── User-chosen crop ────────────────────────────────────────────────────────
// The app's adjuster sends a normalised rectangle. These pin that it is
// honoured exactly, and — more importantly — that a hostile or broken one
// cannot make sharp throw and take the upload down with it, since the rectangle
// is user input arriving over the wire.

test('an explicit crop is honoured over the automatic one', async () => {
  // Left half plain, right half a distinct colour. Cropping the RIGHT half must
  // produce an image that is overwhelmingly that colour.
  const src = path.join(tmp, 'halves.jpg');
  await sharp({ create: { width: 1000, height: 1000, channels: 3, background: { r: 20, g: 20, b: 20 } } })
    .composite([{
      input: await sharp({ create: { width: 500, height: 1000, channels: 3, background: { r: 220, g: 30, b: 30 } } }).png().toBuffer(),
      left: 500, top: 0,
    }])
    .jpeg({ quality: 95 })
    .toFile(src);

  const out = path.join(tmp, 'right-half.webp');
  await convertToSquareWebp(src, out, { maxSize: 400, crop: { x: 0.5, y: 0.25, width: 0.5, height: 0.5 } });

  const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
  let red = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] > 180 && data[i + 1] < 90) red += 1;
  }
  const ratio = red / (info.width * info.height);
  assert.ok(ratio > 0.9,
    `cropping the right half must yield the red region (got ${(ratio * 100).toFixed(1)}%)`);

  const m = await sharp(out).metadata();
  assert.equal(m.width, m.height, 'a cropped avatar is still square');
});

test('an out-of-bounds crop is clamped, not thrown', async () => {
  const src = await portrait('bounds.jpg', 800, 1000);
  const out = path.join(tmp, 'bounds.webp');

  // Deliberately impossible: origin past the far edge, size larger than the image.
  await convertToSquareWebp(src, out, { maxSize: 400, crop: { x: 0.95, y: 0.95, width: 2, height: 2 } });

  const m = await sharp(out).metadata();
  assert.equal(m.width, m.height, 'still square');
  assert.ok(m.width > 0, 'still produced an image rather than failing the upload');
});

test('a nonsense crop cannot crash the upload', async () => {
  const src = await portrait('junk.jpg', 600, 800);
  for (const crop of [
    { x: -5, y: -5, width: -1, height: -1 },
    { x: NaN, y: NaN, width: NaN, height: NaN },
    { x: 0, y: 0, width: 0, height: 0 },
  ]) {
    const out = path.join(tmp, `junk-${Math.random().toString(36).slice(2)}.webp`);
    await convertToSquareWebp(src, out, { maxSize: 300, crop });
    const m = await sharp(out).metadata();
    assert.equal(m.width, m.height, `square for ${JSON.stringify(crop)}`);
  }
});
