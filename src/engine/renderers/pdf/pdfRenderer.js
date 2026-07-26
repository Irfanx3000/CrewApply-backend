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
// engine/blocks.js. Each returns a pdfmake content node (or array of them). ──

function paintHeader(b, colors) {
  const nodes = [{ text: b.props.name || '', style: 'name' }];
  if (b.props.headline) nodes.push({ text: b.props.headline, style: 'headline' });
  const photoPath = resolveImagePath(b.props.photo);
  if (photoPath) nodes.unshift({ image: photoPath, width: 60, height: 60, alignment: 'center', margin: [0, 0, 0, 8] });
  if (b.props.contactLine) nodes.push({ text: b.props.contactLine, style: 'muted', margin: [0, 4, 0, 0] });
  return { stack: nodes, alignment: 'center', margin: [0, 0, 0, 12] };
}

function paintDivider(b) {
  return {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: b.props.thickness || 1, lineColor: b.props.color || '#D9D9D9' }],
    margin: [0, 4, 0, 12],
  };
}

function paintParagraph(b) {
  return { text: b.props.text || '', margin: [0, 0, 0, 8] };
}

function paintBulletList(b) {
  if (!b.props.items?.length) return null;
  return { ul: b.props.items, margin: [0, 2, 0, 8] };
}

function paintTimelineItem(b) {
  const nodes = [{ text: b.props.title || '', bold: true }];
  const meta = [b.props.subtitle, b.props.dateRange].filter(Boolean).join('  •  ');
  if (meta) nodes.push({ text: meta, style: 'muted' });
  const children = (b.children || []).map(paintBlock).filter(Boolean);
  return { stack: [...nodes, ...children], margin: [0, 0, 0, 10] };
}

function paintTimeline(b) {
  const items = (b.children || []).map(paintTimelineItem).filter(Boolean);
  return items.length ? { stack: items } : null;
}

function paintTable(b) {
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
    margin: [0, 2, 0, 8],
  };
}

function paintColumns(b) {
  const cols = (b.children || []).map((colBlocks) => ({ stack: (colBlocks || []).map(paintBlock).filter(Boolean) }));
  return { columns: cols, margin: [0, 0, 0, 8] };
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

function paintSection(b) {
  const children = (b.children || []).map(paintBlock).filter(Boolean);
  if (!children.length) return null;
  return { stack: [{ text: b.props.title || '', style: 'sectionTitle' }, ...children], margin: [0, 0, 0, 12] };
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

function paintBlock(b) {
  const painter = PAINTERS[b.type];
  return painter ? painter(b) : null;
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
  const { page = {}, typography = {}, colors = {}, blocks = [] } = documentModel;

  const docDefinition = {
    pageSize: page.size || 'A4',
    pageMargins: [page.margins?.left ?? 40, page.margins?.top ?? 40, page.margins?.right ?? 40, page.margins?.bottom ?? 40],
    defaultStyle: { font: 'Roboto', fontSize: typography.baseFontSize || 10, lineHeight: typography.lineHeight || 1.3 },
    styles: buildStyles(typography, colors),
    content: blocks.map(paintBlock).filter(Boolean),
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
