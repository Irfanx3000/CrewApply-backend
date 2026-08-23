'use strict';

const fs = require('fs');
const path = require('path');
const PdfPrinter = require('pdfmake/js/Printer').default;
const URLResolver = require('pdfmake/js/URLResolver').default;
const vfs = require('pdfmake/js/virtual-fs').default;
const { BLOCK_TYPES: T, REGIONS } = require('../../blocks');
const { FONTS } = require('./fonts');
const { iconNode } = require('./icons');
const { circularPhoto } = require('./photoMask');

// Page dimensions in pt, needed up front to size the sidebar band and to give
// canvas primitives (dividers, rules) a real width instead of the single
// hardcoded 515 that only ever suited A4-at-40pt-margins.
const PAGE_DIMENSIONS = {
  A4: { width: 595.28, height: 841.89 },
  Letter: { width: 612, height: 792 },
};

// Resolves a Document.path-style relative path ("uploads/profile/x.webp") to
// an absolute one pdfmake can embed. Never throws — a resume without a
// photo is still a perfectly usable document, so any resolution failure
// just silently omits the image rather than failing the whole render.
function resolveImagePath(relativePath) {
  if (!relativePath) return null;
  try {
    const abs = path.join(__dirname, '..', '..', '..', relativePath.replace(/^\/+/, ''));
    return fs.existsSync(abs) ? abs : null;
  } catch {
    return null;
  }
}

// ── Palette regions ────────────────────────────────────────────────────────
// A block never carries a colour. It inherits the palette of the region it is
// painted in, and a Columns block can put a different region in each column.
// That single indirection is the whole mechanism behind a dark sidebar sitting
// next to a white main column in one flowing document.
function resolvePalette(colors, region) {
  if (region === REGIONS.SIDEBAR) {
    return {
      heading: colors.sidebarText || '#FFFFFF',
      name: colors.sidebarText || '#FFFFFF',
      accent: colors.sidebarAccent || '#4A90E2',
      text: colors.sidebarText || '#FFFFFF',
      muted: colors.sidebarMuted || '#B9C0CC',
      divider: colors.sidebarDivider || '#4A5160',
    };
  }
  return {
    heading: colors.primary || '#0D3E85',
    name: colors.primary || '#0D3E85',
    accent: colors.secondary || '#056DEC',
    text: colors.text || '#1E1E1E',
    muted: colors.muted || '#556172',
    divider: colors.divider || '#D9D9D9',
  };
}

// A child context for painting inside a column: same typography/spacing, but
// its own palette and its own available width for canvas primitives.
const regionCtx = (ctx, region, width) => ({
  ...ctx,
  region,
  palette: resolvePalette(ctx.colors, region),
  width,
});

// ── One "paint" function per IDM block type — the finite vocabulary from
// engine/blocks.js. Each returns a pdfmake content node (or array of them).
// `ctx` (colors/spacing/typography/palette/width, resolved once in render()
// below) is threaded through every call so template config actually reaches
// the PDF instead of being silently dropped in favor of hardcoded values. ────

function paintHeader(b, ctx) {
  const { spacing, palette } = ctx;
  const style = b.props.headerStyle || 'centered';
  const alignment = style === 'left' ? 'left' : 'center';
  const bottomMargin = spacing.sectionGap ?? 12;

  const nameNode = { text: b.props.name || '', style: 'name', color: palette.name };
  // characterSpacing is what lets Roboto stand in for the wide-set display
  // faces these designs use — see the font substitution note in fonts.js.
  if (b.props.nameLetterSpacing) nameNode.characterSpacing = b.props.nameLetterSpacing;

  const nodes = [nameNode];
  if (b.props.headline) nodes.push({ text: b.props.headline, style: 'headline', color: palette.accent });

  // _resolvedPhoto is set by prepareAssets() before painting — masking is
  // async (sharp) and painters are sync, so it cannot happen here.
  const photoPath = b.props._resolvedPhoto || resolveImagePath(b.props.photo);
  if (photoPath) {
    const size = b.props.photoSize || 60;
    nodes.unshift({ image: photoPath, width: size, height: size, alignment, margin: [0, 0, 0, 8] });
  }
  if (b.props.contactLine) nodes.push({ text: b.props.contactLine, style: 'muted', color: palette.muted, margin: [0, 4, 0, 0] });

  // 'banner' keeps the centered header but adds a bold colored rule beneath
  // it — a distinct treatment without the complexity of a true text-over-
  // fill overlay, which pdfmake doesn't support cleanly for this vocabulary.
  if (style === 'banner') {
    return {
      stack: [
        { stack: nodes, alignment: 'center', margin: [0, 0, 0, 6] },
        {
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: ctx.width, y2: 0, lineWidth: 3, lineColor: ctx.colors.primary || '#0D3E85' }],
          margin: [0, 0, 0, bottomMargin],
        },
      ],
    };
  }

  return { stack: nodes, alignment, margin: [0, 0, 0, bottomMargin] };
}

function paintDivider(b, ctx) {
  const { spacing } = ctx;
  const style = b.props.style || 'line';
  const bottomMargin = spacing.sectionGap ?? 12;
  const color = b.props.color || '#D9D9D9';

  // 'none' never reaches here — buildDocumentModel.js skips the block
  // entirely for that style rather than relying on a painter no-op.
  if (style === 'dots') {
    const dotCount = 30;
    const gap = ctx.width / (dotCount - 1);
    const canvas = Array.from({ length: dotCount }, (_, i) => ({
      type: 'ellipse', x: i * gap, y: 0, r1: 1, r2: 1, color,
    }));
    return { canvas, margin: [0, 5, 0, bottomMargin] };
  }

  return {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: ctx.width, y2: 0, lineWidth: b.props.thickness || 1, lineColor: color }],
    margin: [0, 4, 0, bottomMargin],
  };
}

function paintParagraph(b, ctx) {
  const node = { text: b.props.text || '', color: ctx.palette.text, margin: [0, 0, 0, ctx.spacing.blockPadding ?? 4] };
  if (b.props.align) node.alignment = b.props.align;
  return node;
}

// pdfmake's `ul` has one bullet glyph and no colour control, so anything other
// than the default disc is drawn as an explicit two-cell row: glyph, then text.
// That also gives hanging indents that actually line up under wrapped lines.
function paintBulletList(b, ctx) {
  if (!b.props.items?.length) return null;
  const { palette, spacing } = ctx;
  const style = b.props.bulletStyle;
  const bottom = spacing.blockPadding ?? 4;

  if (!style || style === 'disc') {
    const node = { ul: b.props.items, color: palette.text, margin: [0, 2, 0, bottom] };
    if (b.props.columns > 1) return { columns: splitIntoColumns(b.props.items, b.props.columns).map((items) => ({ ul: items, color: palette.text })), margin: [0, 2, 0, bottom] };
    return node;
  }

  const glyph = style === 'circle' ? '○' : style === 'dash' ? '–' : style === 'none' ? '' : '•';
  const rows = b.props.items.map((item) => ({
    columns: [
      { width: glyph ? 10 : 0, text: glyph, color: palette.accent, fontSize: (ctx.typography.baseFontSize || 10) * 0.85 },
      { width: '*', text: String(item), color: palette.text },
    ],
    columnGap: 0,
    margin: [0, 0, 0, Math.max((spacing.itemGap ?? 8) / 3, 1)],
  }));

  if (b.props.columns > 1) {
    return {
      columns: splitIntoColumns(rows, b.props.columns).map((group) => ({ stack: group })),
      columnGap: 12,
      margin: [0, 2, 0, bottom],
    };
  }
  return { stack: rows, margin: [0, 2, 0, bottom] };
}

// Column-major split so a 2-column skills list reads down-then-across, the way
// a printed list normally does.
function splitIntoColumns(items, count) {
  const perColumn = Math.ceil(items.length / count);
  return Array.from({ length: count }, (_, c) => items.slice(c * perColumn, (c + 1) * perColumn)).filter((g) => g.length);
}

function paintIconText(b, ctx) {
  const { palette, typography, spacing } = ctx;
  const size = (typography.baseFontSize || 10) * 0.95;
  const icon = iconNode(b.props.icon, b.props.iconColor || palette.accent, size);
  const textNode = { width: '*', text: b.props.text || '', color: palette.text, fontSize: (typography.baseFontSize || 10) * 0.95 };

  // Unknown icon name (or a renderer that has no glyph for it) degrades to the
  // text alone rather than leaving a hole.
  if (!icon) return { ...textNode, width: undefined, margin: [0, 0, 0, spacing.itemGap ?? 6] };

  return {
    columns: [{ width: size + 6, stack: [icon], margin: [0, 1, 0, 0] }, textNode],
    columnGap: 0,
    margin: [0, 0, 0, Math.max((spacing.itemGap ?? 8) * 0.6, 2)],
  };
}

function paintLabelValueList(b, ctx) {
  const { palette, spacing, typography } = ctx;
  if (!b.props.items?.length) return null;
  const bottom = spacing.blockPadding ?? 4;
  const gap = Math.max((spacing.itemGap ?? 8) / 2, 2);
  const bullet = b.props.bulletStyle === 'circle' ? '○' : null;

  // 'inline' puts label and value side by side on one row (Languages);
  // 'stacked' puts a small muted label above its value (Maritime Profile in a
  // narrow sidebar, where two columns would wrap badly).
  if (b.props.layout === 'stacked') {
    return {
      stack: b.props.items.map((it) => ({
        stack: [
          { text: it.label, color: palette.muted, fontSize: (typography.baseFontSize || 10) * 0.8 },
          { text: String(it.value ?? ''), color: palette.text },
        ],
        margin: [0, 0, 0, gap],
      })),
      margin: [0, 2, 0, bottom],
    };
  }

  return {
    stack: b.props.items.map((it) => ({
      columns: [
        ...(bullet ? [{ width: 10, text: bullet, color: palette.accent, fontSize: (typography.baseFontSize || 10) * 0.85 }] : []),
        { width: 'auto', text: `${it.label}:`, bold: true, color: palette.text },
        { width: '*', text: String(it.value ?? ''), color: palette.muted, margin: [6, 0, 0, 0] },
      ],
      columnGap: 0,
      margin: [0, 0, 0, gap],
    })),
    margin: [0, 2, 0, bottom],
  };
}

function paintTimelineItem(b, ctx) {
  const { palette, spacing, typography } = ctx;
  const nodes = [{ text: b.props.title || '', bold: true, color: palette.text }];

  const subtitle = b.props.subtitle;
  const dates = b.props.dateRange;
  const align = b.props.dateAlign || 'inline';

  if (align === 'right' && (subtitle || dates)) {
    // Role on its own line, then company left / dates right — the two-column
    // meta row the reference designs use.
    nodes.push({
      columns: [
        { width: '*', text: subtitle || '', color: palette.muted, fontSize: (typography.baseFontSize || 10) * 0.9 },
        { width: 'auto', text: dates || '', color: palette.muted, fontSize: (typography.baseFontSize || 10) * 0.9, alignment: 'right' },
      ],
      columnGap: 8,
      margin: [0, 1, 0, 0],
    });
  } else if (align === 'below') {
    if (dates) nodes.push({ text: dates, color: palette.muted, fontSize: (typography.baseFontSize || 10) * 0.9, margin: [0, 2, 0, 0] });
  } else {
    const meta = [subtitle, dates].filter(Boolean).join('  •  ');
    if (meta) nodes.push({ text: meta, style: 'muted', color: palette.muted });
  }

  if (b.props.footnote) {
    nodes.push({ text: b.props.footnote, italics: true, color: palette.muted, fontSize: (typography.baseFontSize || 10) * 0.9, margin: [0, 2, 0, 0] });
  }

  const children = (b.children || []).map((child) => paintBlock(child, ctx)).filter(Boolean);
  return {
    stack: [...nodes, ...children],
    margin: [0, 0, 0, spacing.itemGap ?? 8],
    // Keeps a role heading from being stranded at the foot of a page with its
    // bullets orphaned onto the next one.
    unbreakable: children.length === 0,
  };
}

function paintTimeline(b, ctx) {
  const items = (b.children || []).map((child) => paintTimelineItem(child, ctx)).filter(Boolean);
  return items.length ? { stack: items } : null;
}

function paintTable(b, ctx) {
  const { columns, rows } = b.props;
  if (!columns?.length || !rows?.length) return null;
  return {
    table: {
      headerRows: 1,
      widths: columns.map(() => '*'),
      body: [
        columns.map((c) => ({ text: c.label, bold: true, color: ctx.palette.text })),
        ...rows.map((row) => columns.map((c) => ({ text: String(row[c.key] ?? ''), color: ctx.palette.text }))),
      ],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 2, 0, ctx.spacing.blockPadding ?? 4],
  };
}

// Two shapes are supported, deliberately:
//   • the original — children are arrays of blocks, no props, equal widths;
//   • the layout form — props.widths / props.regions / props.padding, which is
//     what buildDocumentModel emits for a two-column template. Each column gets
//     its own palette and its own width, so blocks inside know how wide a rule
//     may be drawn without any of them hardcoding a page measurement.
function paintColumns(b, ctx) {
  const widths = b.props.widths;
  const regions = b.props.regions || [];
  const pad = b.props.padding ?? 0;
  const padTop = b.props.paddingTop ?? pad;

  const cols = (b.children || []).map((colBlocks, i) => {
    const declared = widths?.[i];
    const width = declared || '*';
    const region = regions[i] || ctx.region || REGIONS.MAIN;
    const innerWidth = columnInnerWidth(ctx.width, widths, i, pad);
    const childCtx = regionCtx(ctx, region, innerWidth);
    return {
      width,
      stack: dropTrailingMargin((colBlocks || []).map((child) => paintBlock(child, childCtx)).filter(Boolean)),
      // No BOTTOM padding here on purpose. In a flowing column, trailing
      // margin counts toward the page height, so content that just fits gets
      // pushed onto a blank extra sheet. Bottom breathing room comes from the
      // page's own bottom margin instead (see render()), which pdfmake
      // subtracts from the usable height before laying anything out.
      margin: pad || padTop ? [pad, padTop, pad, 0] : undefined,
    };
  });

  return { columns: cols, columnGap: 0, margin: b.props.padding ? [0, 0, 0, 0] : [0, 0, 0, ctx.spacing.blockPadding ?? 4] };
}

// Every section carries a bottom margin to separate it from the next one. On
// the LAST block there is no next one, and that dangling margin still counts
// toward the page height — which is enough to spill a document that otherwise
// fits onto a second, completely blank page. Nothing is lost by dropping it.
function dropTrailingMargin(nodes) {
  const last = nodes[nodes.length - 1];
  if (last && Array.isArray(last.margin)) {
    nodes[nodes.length - 1] = { ...last, margin: [last.margin[0], last.margin[1], last.margin[2], 0] };
  }
  return nodes;
}

// Best-effort inner width for a column, so canvas primitives inside it stay in
// bounds. Percentages resolve against the page's content width; '*' takes what
// is left over.
function columnInnerWidth(totalWidth, widths, index, pad) {
  if (!widths?.length) return Math.max(totalWidth / (widths?.length || 1) - pad * 2, 40);
  const percentages = widths.map((w) => (typeof w === 'string' && w.endsWith('%') ? parseFloat(w) / 100 : null));
  const known = percentages.reduce((sum, p) => sum + (p || 0), 0);
  const starCount = percentages.filter((p) => p === null).length;
  const ratio = percentages[index] === null ? Math.max(1 - known, 0) / Math.max(starCount, 1) : percentages[index];
  return Math.max(totalWidth * ratio - pad * 2, 40);
}

function paintImage(b) {
  const abs = b.props._resolvedSrc || resolveImagePath(b.props.src);
  return abs ? { image: abs, width: b.props.size || 80 } : null;
}

function paintFooter(b, ctx) {
  return { text: b.props.text || '', style: 'muted', color: ctx.palette.muted, alignment: 'center' };
}

function paintPageBreak() {
  return { text: '', pageBreak: 'after' };
}

function paintSection(b, ctx) {
  const children = (b.children || []).map((child) => paintBlock(child, ctx)).filter(Boolean);
  if (!children.length) return null;

  const { typography, palette, spacing, sectionTitle } = ctx;
  const title = typography.sectionTitleCase === 'upper' ? (b.props.title || '').toUpperCase() : (b.props.title || '');
  const base = typography.baseFontSize || 10;
  const scale = ctx.region === REGIONS.SIDEBAR ? (sectionTitle.sidebarSizeScale ?? 0.85) : 1;

  const titleNode = {
    text: title,
    bold: true,
    color: palette.heading,
    fontSize: base * (typography.headingScale || 1.4) * scale,
    margin: [0, 0, 0, sectionTitle.variant === 'underline' ? 3 : 6],
  };
  if (typography.sectionTitleLetterSpacing) titleNode.characterSpacing = typography.sectionTitleLetterSpacing;

  const head = [titleNode];
  if (sectionTitle.variant === 'underline') {
    head.push({
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: ctx.width, y2: 0, lineWidth: 1, lineColor: palette.divider }],
      margin: [0, 0, 0, 6],
    });
  }

  return {
    stack: [...head, ...children],
    margin: [0, 0, 0, spacing.sectionGap ?? 12],
  };
}

const PAINTERS = {
  [T.HEADER]: paintHeader,
  [T.DIVIDER]: paintDivider,
  [T.PARAGRAPH]: paintParagraph,
  [T.BULLET_LIST]: paintBulletList,
  [T.TIMELINE]: paintTimeline,
  [T.TIMELINE_ITEM]: paintTimelineItem,
  [T.TABLE]: paintTable,
  [T.COLUMNS]: paintColumns,
  [T.IMAGE]: paintImage,
  [T.FOOTER]: paintFooter,
  [T.PAGE_BREAK]: paintPageBreak,
  [T.SECTION]: paintSection,
  [T.ICON_TEXT]: paintIconText,
  [T.LABEL_VALUE_LIST]: paintLabelValueList,
};

function paintBlock(b, ctx) {
  const painter = PAINTERS[b.type];
  return painter ? painter(b, ctx) : null;
}

function buildStyles(typography, colors) {
  return {
    name: { fontSize: (typography.baseFontSize || 10) * (typography.headingScale || 1.4) * (typography.nameScale ?? 1.3), bold: true, color: colors.primary || '#0D3E85' },
    headline: { fontSize: (typography.baseFontSize || 10) * 1.1, color: colors.secondary || '#056DEC' },
    sectionTitle: { fontSize: (typography.baseFontSize || 10) * (typography.headingScale || 1.4), bold: true, color: colors.primary || '#0D3E85', margin: [0, 0, 0, 6] },
    muted: { fontSize: (typography.baseFontSize || 10) * 0.9, color: colors.muted || '#556172' },
  };
}

// ── Page bands ───────────────────────────────────────────────────────────────
// Flat colour rectangles painted behind everything, at absolute page
// coordinates, repeated on every page. Two kinds exist:
//
//   sidebar — a full-height strip down the left or right edge
//   banner  — a strip across the top, either full width or stopping at the
//             sidebar edge so it covers only the main column
//
// They are page DECORATION, not blocks: a block lives in the content stream
// and cannot guarantee it covers the whole page or repeats after a page break.
//
// Returned as {x, y, w, h, color} so exactly one description of the page's
// painted areas serves both the painter and the watermark. That shared list is
// the point — see the watermark note below for why two descriptions would be a
// revenue bug waiting to happen.
function pageBands(dims, page) {
  const bands = [];
  const sidebar = page.sidebar || {};
  const banner = page.banner || {};

  const sidebarOn = !!sidebar.enabled;
  const bandWidth = sidebarOn ? dims.width * (sidebar.widthRatio ?? 0.35) : 0;
  const sidebarOnLeft = sidebar.side !== 'right';

  if (sidebarOn) {
    bands.push({
      x: sidebarOnLeft ? 0 : dims.width - bandWidth,
      y: 0,
      w: bandWidth,
      h: dims.height,
      color: sidebar.color || '#2B303B',
    });
  }

  if (banner.enabled) {
    const height = dims.height * (banner.heightRatio ?? 0.16);
    // 'main' stops the banner at the sidebar edge, so the two bands sit beside
    // each other instead of one painting over the other. 'full' spans the page
    // and is drawn AFTER the sidebar, so it wins where they overlap — which is
    // what a full-width header band across a sidebar layout should look like.
    const overMainOnly = banner.span === 'main' && sidebarOn;
    bands.push({
      x: overMainOnly && sidebarOnLeft ? bandWidth : 0,
      y: 0,
      w: overMainOnly ? dims.width - bandWidth : dims.width,
      h: height,
      color: banner.color || '#0D3E85',
    });
  }

  return bands;
}

// Relative luminance (WCAG). Used only to decide whether a band counts as
// "dark" for watermark contrast — not for any colour maths, so the simple
// sRGB-weighted form is sufficient and avoids a gamma pass.
function isDarkColor(hex) {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(hex || ''));
  if (!m) return false;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.55;
}

// ── Free-tier watermark ────────────────────────────────────────────────────
// Drawn as page decoration, never as blocks: it has to cover every page in
// full regardless of how the content flows, which nothing inside the content
// stream can guarantee. Sitting behind the content also keeps the text crisp.
//
// Each tile picks its colour from whatever is painted UNDER it, so the mark
// stays visible on any template. This used to test one thing only — "is this x
// over the sidebar strip" — which silently failed the moment a design put dark
// paint anywhere else: a dark header banner, or a dark page ground, produced
// dark tiles on a dark field and the watermark effectively vanished. On a
// free-tier document that is not a cosmetic bug, it is the paid output being
// given away.
//
// It now tests each tile against the SAME band list the painter uses, so a
// band cannot exist visually without the watermark knowing about it.

const escapeXml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function watermarkTilesSvg(wm, dims, bands, pageBackground) {
  const stepX = wm.stepX || 168;
  const stepY = wm.stepY || 116;
  const angle = wm.angle ?? -32;
  const opacity = wm.opacity ?? 0.075;
  // White on a dark band reads weaker than dark on white at the same alpha,
  // so the light tiles get a little more to land at the same visual weight.
  const opacityOnDark = wm.opacityOnDark ?? Math.min(1, opacity * 1.5);
  const label = escapeXml(wm.text || 'PREVIEW');

  // Only dark bands matter — a light band takes the same dark tile the white
  // page does. Reversed so the LAST band painted (the one actually visible at
  // that point) is the first one matched.
  const darkBands = bands.filter((b) => isDarkColor(b.color)).reverse();
  const groundIsDark = isDarkColor(pageBackground);

  const overDark = (x, y) => {
    // Tiles deliberately start off-page and overrun the far edge so rotation
    // cannot leave bare corners. Those anchors sit outside every band, so
    // testing them raw would classify a tile that visually lands ON a dark
    // band as being over white — a light-on-light sliver at exactly the page
    // edge. Clamping the anchor into the page asks the question that matters:
    // what is painted where this tile is actually seen.
    const cx = Math.min(Math.max(x, 0), dims.width);
    const cy = Math.min(Math.max(y, 0), dims.height);
    for (const b of darkBands) {
      if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) return true;
    }
    return groundIsDark;
  };

  const tiles = [];
  // Starts off-page and overruns the far edge so rotation can't leave bare
  // corners.
  for (let x = -stepX / 2; x < dims.width + stepX; x += stepX) {
    for (let y = stepY / 2; y < dims.height + stepY; y += stepY) {
      const onDark = overDark(x, y);
      const fill = onDark ? '#FFFFFF' : '#1E1E1E';
      const alpha = onDark ? opacityOnDark : opacity;
      tiles.push(
        `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" transform="rotate(${angle} ${x.toFixed(1)} ${y.toFixed(1)})" ` +
        `font-family="Roboto" font-size="15" font-weight="bold" fill="${fill}" opacity="${alpha}">${label}</text>`
      );
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dims.width}" height="${dims.height}">${tiles.join('')}</svg>`;
}

/**
 * The footer band. Inset clear of any full-height side band so the rule and
 * the copy never run onto dark paint where they'd be unreadable, and recoloured
 * when the page ground itself is dark.
 */
function watermarkFooter(wm, dims, bands, margins, pageBackground) {
  // Only full-height bands can reach the footer; a top banner cannot.
  const sideBands = bands.filter((b) => b.h >= dims.height * 0.9);
  const leftBand = sideBands.find((b) => b.x <= 1);
  const rightBand = sideBands.find((b) => b.x + b.w >= dims.width - 1);

  const left = (leftBand ? leftBand.w : 0) + (margins[0] || 24) + 12;
  const right = (rightBand ? rightBand.w : 0) + (margins[2] || 24) + 12;

  const onDark = isDarkColor(pageBackground);
  const ruleColor = onDark ? '#4A5563' : '#C9D2DE';
  const textColor = onDark ? '#9AA6B5' : '#8A94A6';

  return () => ({
    stack: [
      { canvas: [{ type: 'line', x1: left, y1: 0, x2: dims.width - right, y2: 0, lineWidth: 0.7, lineColor: ruleColor }] },
      {
        text: wm.footer || '',
        alignment: 'center',
        fontSize: 7,
        characterSpacing: 0.6,
        color: textColor,
        margin: [left, 4, right, 0],
      },
    ],
    margin: [0, 2, 0, 0],
  });
}

// Async pre-pass: anything a painter needs but cannot produce synchronously.
// Today that's exactly one thing — masking an avatar into a circle with sharp
// (pdfmake has no clipping path, see photoMask.js). Walks the whole tree so it
// works regardless of which column the header ended up in.
async function prepareAssets(blocks, header) {
  for (const b of blocks || []) {
    if (b.type === T.HEADER && b.props.photo) {
      const abs = resolveImagePath(b.props.photo);
      if (abs) {
        if ((b.props.photoShape || 'circle') === 'circle') {
          // 3x the placed size keeps it crisp at print resolution.
          b.props._resolvedPhoto = await circularPhoto(abs, {
            size: Math.round((b.props.photoSize || 60) * 3),
            ringWidth: (b.props.photoRingWidth || 0) * 3,
            ringColor: b.props.photoRingColor || header?.photoRingColor || '#FFFFFF',
          });
        }
        if (!b.props._resolvedPhoto) b.props._resolvedPhoto = abs;
      }
    }
    // Columns hold arrays of arrays; everything else holds a flat array.
    for (const child of b.children || []) {
      await prepareAssets(Array.isArray(child) ? child : [child], header);
    }
  }
}

/**
 * IDM (Intermediate Document Model, from engine/buildDocumentModel.js) -> PDF Buffer.
 * Pure format-adapter: knows nothing about MongoDB/CareerProfile/Express —
 * only the closed Block vocabulary.
 */
async function render(documentModel) {
  const { page = {}, typography = {}, colors = {}, spacing = {}, sectionTitle = {}, blocks = [], watermark = null } = documentModel;

  const dims = PAGE_DIMENSIONS[page.size] || PAGE_DIMENSIONS.A4;
  // colors.background was declared in the template schema but never painted —
  // a template could ask for a dark page and silently get white. Honoured now,
  // and fed to the watermark so its tiles contrast against it.
  const pageBackground = colors.background || '#FFFFFF';
  const sidebar = page.sidebar || {};
  const sidebarOn = !!sidebar.enabled;

  // With a sidebar the band must reach every page edge, so left/top/right
  // margins go to zero and each column supplies its own padding. The BOTTOM
  // margin stays real: it is what stops content running into the page edge,
  // and unlike a trailing block margin pdfmake removes it from the usable
  // height up front, so content that fits on one page stays on one page. The
  // band is unaffected either way — it is painted by the `background` hook at
  // absolute page coordinates, which margins do not constrain.
  const margins = sidebarOn
    ? [0, 0, 0, spacing.columnPadding ?? 24]
    : [page.margins?.left ?? 40, page.margins?.top ?? 40, page.margins?.right ?? 40, page.margins?.bottom ?? 40];

  const contentWidth = dims.width - margins[0] - margins[2];

  const ctx = {
    colors,
    spacing,
    typography,
    sectionTitle,
    region: REGIONS.MAIN,
    palette: resolvePalette(colors, REGIONS.MAIN),
    width: contentWidth,
  };

  await prepareAssets(blocks, {});

  const docDefinition = {
    pageSize: page.size || 'A4',
    pageMargins: margins,
    defaultStyle: { font: 'Roboto', fontSize: typography.baseFontSize || 10, lineHeight: typography.lineHeight || 1.3, color: colors.text || '#1E1E1E' },
    styles: buildStyles(typography, colors),
    content: blocks.map((b) => paintBlock(b, ctx)).filter(Boolean),
  };

  // Page decorations — painted behind the content and repeated on every page.
  // Both the sidebar band and the watermark have to cover the full page
  // regardless of how content flows, which nothing inside the content stream
  // can guarantee. Composed into one background array so their stacking order
  // is explicit: band first, wordmark over it.
  //
  // The renderer only OBEYS the watermark flag; it never decides it. That call
  // belongs to resumeRender.service.js, which reads live subscription state.
  const layers = [];

  // One list describes every painted area of the page, and BOTH the painter
  // and the watermark read it. Keeping a single description is the whole
  // point: a second, separate notion of "where is it dark" is how the
  // watermark silently stopped being visible on new designs.
  const bands = pageBands(dims, page);

  // A dark page ground has to be painted first, under every band.
  if (pageBackground && pageBackground !== '#FFFFFF') {
    layers.push({
      canvas: [{ type: 'rect', x: 0, y: 0, w: dims.width, h: dims.height, color: pageBackground }],
    });
  }

  for (const band of bands) {
    layers.push({
      canvas: [{ type: 'rect', x: band.x, y: band.y, w: band.w, h: band.h, color: band.color }],
    });
  }

  if (watermark) {
    layers.push({
      svg: watermarkTilesSvg(watermark, dims, bands, pageBackground),
      width: dims.width,
      absolutePosition: { x: 0, y: 0 },
    });
  }

  if (layers.length) docDefinition.background = () => layers;

  if (watermark?.footer) {
    docDefinition.footer = watermarkFooter(watermark, dims, bands, margins, pageBackground);
  }

  const urlResolver = new URLResolver(vfs);
  const printer = new PdfPrinter(FONTS, vfs, urlResolver);
  const pdfDoc = await printer.createPdfKitDocument(docDefinition);

  return new Promise((resolve, reject) => {
    const chunks = [];
    pdfDoc.on('data', (chunk) => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });
}

// Exposed for tests only. Where the page is dark is a RENDERER concern —
// nothing else should decide it — but the watermark-contrast invariant is
// important enough to pin directly rather than by eyeballing a PDF.
module.exports = { render, __test: { pageBands, isDarkColor, watermarkTilesSvg, watermarkFooter } };
