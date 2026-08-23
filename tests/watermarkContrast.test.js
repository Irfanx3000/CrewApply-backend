'use strict';

// Watermark contrast regression test.
//
// The free-tier watermark is the only thing separating the free output from
// the paid one. It is invisible — and therefore absent in every way that
// matters — if its tiles are painted dark on a dark ground.
//
// The old implementation asked one question: "is this x over the sidebar
// strip?". That was true for the templates that existed when it was written
// and silently wrong for every design that puts dark paint anywhere else: a
// dark header banner, a dark page ground, a banner that stops at the sidebar.
//
// These tests assert the property that actually matters — NO tile is ever
// low-contrast against what is painted beneath it — across every band
// arrangement the schema can express.

const test = require('node:test');
const assert = require('node:assert/strict');

const renderer = require('../src/engine/renderers/pdf/pdfRenderer');

// The functions under test are module-internal by design (nothing outside the
// renderer should be deciding where the page is dark). Re-required through the
// module's own file so the test exercises the shipped code, not a copy.
const { __test } = renderer;

const A4 = { width: 595.28, height: 841.89 };
const WM = { text: 'CrewApply', opacity: 0.075, angle: -32, stepX: 168, stepY: 116 };

const DARK = '#2B303B';
const LIGHT = '#EDEDED';

/** Parses the generated SVG back into one record per tile. */
const tilesOf = (svg) =>
  [...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"[^>]*fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
    fill: m[3],
  }));

/**
 * The invariant: a tile sitting on dark paint must be light, and a tile on
 * light paint must be dark. Anything else is an invisible watermark.
 */
const assertEveryTileContrasts = (svg, bands, ground, label) => {
  const darkBands = bands.filter((b) => __test.isDarkColor(b.color));
  const groundDark = __test.isDarkColor(ground);

  const failures = tilesOf(svg).filter(({ x, y, fill }) => {
    // Same clamp the renderer applies: off-page anchors are judged by where
    // the tile is actually seen.
    const cx = Math.min(Math.max(x, 0), A4.width);
    const cy = Math.min(Math.max(y, 0), A4.height);
    const onDark = darkBands.some((b) => cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) || groundDark;
    return onDark ? fill !== '#FFFFFF' : fill !== '#1E1E1E';
  });

  assert.equal(failures.length, 0,
    `${label}: ${failures.length} tile(s) would be invisible, e.g. ${JSON.stringify(failures[0])}`);
};

test('luminance classification is sane', () => {
  assert.equal(__test.isDarkColor('#2B303B'), true, 'charcoal is dark');
  assert.equal(__test.isDarkColor('#0D3E85'), true, 'navy is dark');
  assert.equal(__test.isDarkColor('#1F4B3F'), true, 'deep green is dark');
  assert.equal(__test.isDarkColor('#FFFFFF'), false, 'white is light');
  assert.equal(__test.isDarkColor('#EDEDED'), false, 'light grey is light');
  assert.equal(__test.isDarkColor(null), false, 'a missing colour is not dark');
});

test('no sidebar, white page — every tile is dark', () => {
  const bands = __test.pageBands(A4, {});
  const svg = __test.watermarkTilesSvg(WM, A4, bands, '#FFFFFF');
  assert.ok(tilesOf(svg).length >= 40, `sanity: the page is actually tiled (got ${tilesOf(svg).length})`);
  assertEveryTileContrasts(svg, bands, '#FFFFFF', 'plain white page');
});

test('dark LEFT sidebar — tiles flip over the band', () => {
  const page = { sidebar: { enabled: true, side: 'left', widthRatio: 0.35, color: DARK } };
  const bands = __test.pageBands(A4, page);
  const svg = __test.watermarkTilesSvg(WM, A4, bands, '#FFFFFF');
  assertEveryTileContrasts(svg, bands, '#FFFFFF', 'left sidebar');
  assert.ok(tilesOf(svg).some((t) => t.fill === '#FFFFFF'), 'some tiles must be light over the band');
});

test('dark RIGHT sidebar (template 1) — tiles flip on the correct side', () => {
  const page = { sidebar: { enabled: true, side: 'right', widthRatio: 0.36, color: DARK } };
  const bands = __test.pageBands(A4, page);
  const svg = __test.watermarkTilesSvg(WM, A4, bands, '#FFFFFF');
  assertEveryTileContrasts(svg, bands, '#FFFFFF', 'right sidebar');
});

test('dark TOP BANNER (templates 3 and 4) — the case the old model missed', () => {
  const page = { banner: { enabled: true, heightRatio: 0.17, color: '#0D3E85' } };
  const bands = __test.pageBands(A4, page);
  const svg = __test.watermarkTilesSvg(WM, A4, bands, '#FFFFFF');

  const overBanner = tilesOf(svg).filter((t) => Math.max(t.y, 0) <= A4.height * 0.17);
  assert.ok(overBanner.length > 0, 'sanity: tiles land on the banner');
  assert.ok(overBanner.every((t) => t.fill === '#FFFFFF'),
    'every tile on a dark banner must be light — this is what previously vanished');

  assertEveryTileContrasts(svg, bands, '#FFFFFF', 'top banner');
});

test('banner + sidebar together — both bands respected', () => {
  const page = {
    sidebar: { enabled: true, side: 'right', widthRatio: 0.35, color: DARK },
    banner: { enabled: true, heightRatio: 0.15, span: 'main', color: '#1F4B3F' },
  };
  const bands = __test.pageBands(A4, page);
  assert.equal(bands.length, 2);
  const svg = __test.watermarkTilesSvg(WM, A4, bands, '#FFFFFF');
  assertEveryTileContrasts(svg, bands, '#FFFFFF', 'banner + sidebar');
});

test('LIGHT banner over a white page keeps dark tiles', () => {
  const page = { banner: { enabled: true, heightRatio: 0.25, color: LIGHT } };
  const bands = __test.pageBands(A4, page);
  const svg = __test.watermarkTilesSvg(WM, A4, bands, '#FFFFFF');
  assert.ok(tilesOf(svg).every((t) => t.fill === '#1E1E1E'),
    'a light band must not flip tiles to white — that would be the same bug mirrored');
});

test('dark PAGE GROUND — every tile flips, with or without bands', () => {
  const bands = __test.pageBands(A4, {});
  const svg = __test.watermarkTilesSvg(WM, A4, bands, '#12202E');
  assert.ok(tilesOf(svg).every((t) => t.fill === '#FFFFFF'),
    'a dark page ground must make every tile light');
  assertEveryTileContrasts(svg, bands, '#12202E', 'dark ground');
});

test('a banner spanning MAIN only stops at the sidebar edge', () => {
  const page = {
    sidebar: { enabled: true, side: 'left', widthRatio: 0.35, color: DARK },
    banner: { enabled: true, heightRatio: 0.15, span: 'main', color: '#0D3E85' },
  };
  const bands = __test.pageBands(A4, page);
  const banner = bands[1];
  assert.ok(banner.x > 0, 'banner must start after a left sidebar');
  assert.ok(Math.abs(banner.x + banner.w - A4.width) < 1, 'and run to the right page edge');
});

// ── The real catalogue ──────────────────────────────────────────────────────
// The synthetic cases above prove the model is correct. This proves the
// SHIPPED templates are safe, which is the claim that actually matters: a
// template whose watermark is invisible is the paid output given away free.
// It reads the live collection, so a template added later by an admin through
// the panel — not just the seed script — is covered too.
test('every active template keeps its watermark visible', async () => {
  require('dotenv').config({ quiet: true });
  const mongoose = require('mongoose');
  if (!process.env.MONGODB_URI) return;

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const ResumeTemplate = require('../src/models/resumeTemplate.model');
    const templates = await ResumeTemplate.find({ isActive: true }).lean();
    assert.ok(templates.length > 0, 'sanity: the catalogue is not empty');

    for (const t of templates) {
      const page = t.layout?.page || {};
      const bands = __test.pageBands(A4, page);
      const ground = t.layout?.colors?.background || '#FFFFFF';
      const svg = __test.watermarkTilesSvg(WM, A4, bands, ground);
      assertEveryTileContrasts(svg, bands, ground, `template "${t.key}"`);
    }
  } finally {
    await mongoose.connection.close();
  }
});
