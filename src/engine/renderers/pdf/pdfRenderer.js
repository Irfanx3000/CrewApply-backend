'use strict';

const fs = require('fs');
const path = require('path');
const PdfPrinter = require('pdfmake/js/Printer').default;
const URLResolver = require('pdfmake/js/URLResolver').default;
const vfs = require('pdfmake/js/virtual-fs').default;
const { BLOCK_TYPES: T } = require('../../blocks');
const { FONTS } = require('./fonts');

// src/engine/renderers/pdf -> src/ -> project root's uploads/ dir.
const UPLOADS_ROOT = path.join(__dirname, '..', '..', '..', 'uploads');

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

// ── One "paint" function per IDM block type — the finite vocabulary from
// engine/blocks.js. Each returns a pdfmake content node (or array of them).
// `ctx` (colors/spacing/typography, resolved once in render() below) is
// threaded through every call so template config actually reaches the PDF
// instead of being silently dropped in favor of hardcoded values. ──────────

function paintHeader(b, ctx) {
  const { colors, spacing } = ctx;
  const style = b.props.headerStyle || 'centered';
  const alignment = style === 'left' ? 'left' : 'center';
  const bottomMargin = spacing.sectionGap ?? 12;

  const nodes = [{ text: b.props.name || '', style: 'name' }];
  if (b.props.headline) nodes.push({ text: b.props.headline, style: 'headline' });
  const photoPath = resolveImagePath(b.props.photo);
  if (photoPath) nodes.unshift({ image: photoPath, width: 60, height: 60, alignment, margin: [0, 0, 0, 8] });
  if (b.props.contactLine) nodes.push({ text: b.props.contactLine, style: 'muted', margin: [0, 4, 0, 0] });

  // 'banner' keeps the centered header but adds a bold colored rule beneath
  // it — a distinct treatment without the complexity of a true text-over-
  // fill overlay, which pdfmake doesn't support cleanly for this vocabulary.
  if (style === 'banner') {
    return {
      stack: [
        { stack: nodes, alignment: 'center', margin: [0, 0, 0, 6] },
        {
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 3, lineColor: colors.primary || '#0D3E85' }],
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
    const gap = 515 / (dotCount - 1);
    const canvas = Array.from({ length: dotCount }, (_, i) => ({
      type: 'ellipse', x: i * gap, y: 0, r1: 1, r2: 1, color,
    }));
    return { canvas, margin: [0, 5, 0, bottomMargin] };
  }

  return {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: b.props.thickness || 1, lineColor: color }],
    margin: [0, 4, 0, bottomMargin],
  };
}

function paintParagraph(b, ctx) {
  return { text: b.props.text || '', margin: [0, 0, 0, ctx.spacing.blockPadding ?? 4] };
}

function paintBulletList(b, ctx) {
  if (!b.props.items?.length) return null;
  return { ul: b.props.items, margin: [0, 2, 0, ctx.spacing.blockPadding ?? 4] };
}

function paintTimelineItem(b, ctx) {
  const nodes = [{ text: b.props.title || '', bold: true }];
  const meta = [b.props.subtitle, b.props.dateRange].filter(Boolean).join('  •  ');
  if (meta) nodes.push({ text: meta, style: 'muted' });
  const children = (b.children || []).map((child) => paintBlock(child, ctx)).filter(Boolean);
  return { stack: [...nodes, ...children], margin: [0, 0, 0, ctx.spacing.itemGap ?? 8] };
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
        columns.map((c) => ({ text: c.label, bold: true })),
        ...rows.map((row) => columns.map((c) => String(row[c.key] ?? ''))),
      ],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 2, 0, ctx.spacing.blockPadding ?? 4],
  };
}

function paintColumns(b, ctx) {
  const cols = (b.children || []).map((colBlocks) => ({
    stack: (colBlocks || []).map((child) => paintBlock(child, ctx)).filter(Boolean),
  }));
  return { columns: cols, margin: [0, 0, 0, ctx.spacing.blockPadding ?? 4] };
}

function paintImage(b) {
  const abs = resolveImagePath(b.props.src);
  return abs ? { image: abs, width: b.props.size || 80 } : null;
}

function paintFooter(b) {
  return { text: b.props.text || '', style: 'muted', alignment: 'center' };
}

function paintPageBreak() {
  return { text: '', pageBreak: 'after' };
}

function paintSection(b, ctx) {
  const children = (b.children || []).map((child) => paintBlock(child, ctx)).filter(Boolean);
  if (!children.length) return null;
  const title = ctx.typography.sectionTitleCase === 'upper' ? (b.props.title || '').toUpperCase() : (b.props.title || '');
  return { stack: [{ text: title, style: 'sectionTitle' }, ...children], margin: [0, 0, 0, ctx.spacing.sectionGap ?? 12] };
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
};

function paintBlock(b, ctx) {
  const painter = PAINTERS[b.type];
  return painter ? painter(b, ctx) : null;
}

function buildStyles(typography, colors) {
  return {
    name: { fontSize: (typography.baseFontSize || 10) * (typography.headingScale || 1.4) * 1.3, bold: true, color: colors.primary || '#0D3E85' },
    headline: { fontSize: (typography.baseFontSize || 10) * 1.1, color: colors.secondary || '#056DEC' },
    sectionTitle: { fontSize: (typography.baseFontSize || 10) * (typography.headingScale || 1.4), bold: true, color: colors.primary || '#0D3E85', margin: [0, 0, 0, 6] },
    muted: { fontSize: (typography.baseFontSize || 10) * 0.9, color: colors.muted || '#556172' },
  };
}

/**
 * IDM (Intermediate Document Model, from engine/buildDocumentModel.js) -> PDF Buffer.
 * Pure format-adapter: knows nothing about MongoDB/CareerProfile/Express —
 * only the closed Block vocabulary.
 */
async function render(documentModel) {
  const { page = {}, typography = {}, colors = {}, spacing = {}, blocks = [] } = documentModel;
  const ctx = { colors, spacing, typography };

  const docDefinition = {
    pageSize: page.size || 'A4',
    pageMargins: [page.margins?.left ?? 40, page.margins?.top ?? 40, page.margins?.right ?? 40, page.margins?.bottom ?? 40],
    defaultStyle: { font: 'Roboto', fontSize: typography.baseFontSize || 10, lineHeight: typography.lineHeight || 1.3 },
    styles: buildStyles(typography, colors),
    content: blocks.map((b) => paintBlock(b, ctx)).filter(Boolean),
  };

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

module.exports = { render };
