'use strict';

const { BLOCK_TYPES: T, REGIONS, block } = require('./blocks');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

const dateRange = (start, end, isCurrent) => {
  const from = formatDate(start);
  const to = isCurrent ? 'Present' : formatDate(end);
  if (from && to) return `${from} — ${to}`;
  return from || to || null;
};

const visible = (visibilityRules, path, defaultValue = true) => {
  const parts = path.split('.');
  let node = visibilityRules;
  for (const part of parts) {
    if (node == null) return defaultValue;
    node = node[part];
  }
  return node === undefined ? defaultValue : node;
};

// ── Section builders — each takes the resolved content + template hints and
// returns a Block, or null if there's nothing meaningful to show. ──────────

function buildHeader(content, layout) {
  const { personal, contact } = content;
  if (!personal) return null;

  // A template that gives Contact its own section switches this off, so the
  // same email/phone doesn't appear twice on one page.
  const showContactLine = layout.header?.showContactLine !== false;
  const contactLine = showContactLine
    ? [contact?.email, contact?.phone, contact?.currentLocation || contact?.city].filter(Boolean).join('  •  ')
    : null;

  return block(T.HEADER, {
    name: personal.fullName,
    headline: content.maritime?.rank || content.maritime?.designation || content.maritime?.department || null,
    photo: visible(layout.visibilityRules, 'personal.photo', layout.header?.showPhoto) ? personal.avatarUrl : null,
    contactLine,
    headerStyle: layout.header?.style || 'centered',
    photoShape: layout.header?.photoShape || 'circle',
    photoSize: layout.header?.photoSize || 60,
    photoRingWidth: layout.header?.photoRingWidth || 0,
    photoRingColor: layout.header?.photoRingColor || null,
    nameLetterSpacing: layout.typography?.nameLetterSpacing || 0,
    // Banner placement only — ignored by the other two placements.
    placement: layout.header?.placement || 'document',
    photoSide: layout.header?.photoSide || 'left',
    // Contact rendered as icon rows INSIDE the band, instead of (or as well
    // as) the single strip line. The banner designs put phone/email/location
    // in the coloured area beside the name.
    bannerContact: layout.header?.contactInBanner
      ? [
        contact?.currentLocation || contact?.city ? { icon: 'location', text: contact.currentLocation || contact.city } : null,
        contact?.phone ? { icon: 'phone', text: contact.phone } : null,
        contact?.email ? { icon: 'email', text: contact.email } : null,
      ].filter(Boolean)
      : null,
  });
}

// Contact as a standalone SECTION rather than the header's one-line strip —
// what a sidebar layout needs, where each detail gets its own icon'd row.
// Icon names are resolved by the renderer (engine/renderers/pdf/icons.js), so
// nothing here knows what a "phone" actually looks like.
function buildContactSection(content) {
  const c = content.contact;
  if (!c) return null;
  const rows = [
    c.phone && { icon: 'phone', text: c.phone },
    c.email && { icon: 'email', text: c.email },
    (c.currentLocation || [c.city, c.country].filter(Boolean).join(', ')) && {
      icon: 'location',
      text: c.currentLocation || [c.city, c.country].filter(Boolean).join(', '),
    },
  ].filter(Boolean);
  if (!rows.length) return null;

  return block(T.SECTION, { title: 'Contact' }, rows.map((r) => block(T.ICON_TEXT, r)));
}

function buildObjective(content, layout) {
  if (!visible(layout.visibilityRules, 'personal.summary', true)) return null;
  const text = content.objectiveOverride || content.careerObjective;
  if (!text) return null;
  return block(T.PARAGRAPH, { text, align: layout.typography?.paragraphAlign || 'left' });
}

// The objective wrapped in its own titled section — the two-column path needs
// it as an addressable section key ('summary') it can place in a column,
// whereas the single-column path emits it bare, directly under the header.
function buildSummarySection(content, layout) {
  const paragraph = buildObjective(content, layout);
  if (!paragraph) return null;
  return block(T.SECTION, { title: sectionTitleFor('summary', layout) }, [paragraph]);
}

function buildMaritimeSection(content, sectionLayouts) {
  const m = content.maritime;
  if (!m) return null;
  const labelValue = sectionLayouts?.maritime?.display === 'labelValue';

  const pairs = [
    m.department && { label: 'Department', value: m.department },
    m.rank && { label: 'Rank', value: m.rank },
    // Designation is only carried in the label/value treatment. The bullet
    // list is left exactly as it was, so the three pre-existing templates
    // print the same lines they always did.
    labelValue && m.designation && { label: 'Designation', value: m.designation },
    m.currentVessel && { label: 'Current Vessel', value: m.currentVessel },
    m.seaExperienceYears && { label: 'Sea Experience', value: `${m.seaExperienceYears} years` },
    m.availabilityDate && { label: 'Available From', value: formatDate(m.availabilityDate) },
  ].filter(Boolean);
  if (!pairs.length) return null;

  // 'labelValue' stacks each pair as its own row — legible in a narrow sidebar.
  if (labelValue) {
    return block(T.SECTION, { title: 'Maritime Profile' }, [
      block(T.LABEL_VALUE_LIST, { items: pairs, layout: sectionLayouts.maritime.rowLayout || 'stacked' }),
    ]);
  }

  return block(T.SECTION, { title: 'Maritime Profile' }, [
    block(T.BULLET_LIST, { items: pairs.map((p) => `${p.label}: ${p.value}`) }),
  ]);
}

function buildExperienceSection(content, sectionLayouts) {
  const entries = content.experience || [];
  if (!entries.length) return null;
  const display = sectionLayouts?.experience?.display || 'timeline';

  // 'right' splits the meta line: subtitle flush left, dates flush right —
  // the two-column arrangement the reference designs use. Anything else keeps
  // the original single muted "subtitle • dates" line.
  const dateAlign = sectionLayouts?.experience?.dateAlign || 'inline';
  const bulletStyle = sectionLayouts?.experience?.bulletStyle;
  // 'full' spells out employer, vessel type and port on the meta line, which
  // is what a design with a dedicated left-aligned meta row can carry. The
  // default stays the original single field so existing templates are
  // untouched.
  const subtitleMode = sectionLayouts?.experience?.subtitle || 'short';

  const items = entries.map((e) =>
    block(T.TIMELINE_ITEM, {
      title: [e.role, e.vesselName || e.company].filter(Boolean).join(' — '),
      subtitle: subtitleMode === 'full'
        ? [e.company, e.vesselType, e.location].filter(Boolean).join(' – ') || null
        : e.vesselType || e.company || null,
      dateRange: dateRange(e.startDate, e.endDate, e.isCurrent),
      dateAlign,
    }, e.responsibilities?.length
      // COPIED, never the array from `content`. pdfmake's list preprocessor
      // normalizes `ul` items IN PLACE — it replaces each string with an
      // object carrying inline metadata and laid-out pixel positions. Handing
      // it the composer's own array meant rendering silently rewrote the
      // resolved content, which then poisoned the content hash computed from
      // it (see resumeRender.service.js) and left every resume permanently
      // "out of date". The IDM must never alias composer output.
      ? [block(T.BULLET_LIST, { items: [...e.responsibilities], bulletStyle })]
      : [])
  );

  return block(T.SECTION, { title: 'Experience' }, [
    display === 'timeline' ? block(T.TIMELINE, {}, items) : block(T.BULLET_LIST, { items: items.map((i) => i.props.title) }),
  ]);
}

function buildEducationSection(content, sectionLayouts) {
  const entries = content.education || [];
  if (!entries.length) return null;
  // The reference stacks degree / dates / institution on three lines with the
  // institution italicised, rather than the default "institution • dates"
  // meta line — 'stacked' selects that.
  const stacked = sectionLayouts?.education?.display === 'stacked';
  const items = entries.map((e) =>
    block(T.TIMELINE_ITEM, {
      title: [e.degree, e.fieldOfStudy].filter(Boolean).join(', ') || e.institution,
      subtitle: stacked ? null : e.institution,
      dateRange: dateRange(e.startDate, e.endDate, false),
      footnote: stacked ? e.institution : null,
      dateAlign: stacked ? 'below' : 'inline',
    })
  );
  return block(T.SECTION, { title: 'Education' }, [block(T.TIMELINE, {}, items)]);
}

function buildCertificatesSection(content, sectionLayouts) {
  const entries = content.certificates || [];
  if (!entries.length) return null;
  const display = sectionLayouts?.certificates?.display || 'table';
  const showExpiry = sectionLayouts?.certificates?.showExpiry !== false;

  if (display === 'table') {
    const columns = showExpiry
      ? [{ key: 'name', label: 'Certificate' }, { key: 'issuingAuthority', label: 'Issued By' }, { key: 'expiryDate', label: 'Expires' }]
      : [{ key: 'name', label: 'Certificate' }, { key: 'issuingAuthority', label: 'Issued By' }];
    const rows = entries.map((c) => ({
      name: c.name,
      issuingAuthority: c.issuingAuthority || '—',
      expiryDate: formatDate(c.expiryDate) || '—',
    }));
    return block(T.SECTION, { title: 'Certificates' }, [block(T.TABLE, { columns, rows })]);
  }

  return block(T.SECTION, { title: 'Certificates' }, [block(T.BULLET_LIST, { items: entries.map((c) => c.name) })]);
}

// Proficiency words -> a 0-1 magnitude, so a bar can be drawn from the data
// that already exists. These are the CareerProfile enums verbatim (see
// SKILL_LEVELS / LANGUAGE_PROFICIENCIES); nothing new is stored on the profile
// and no migration is needed. An unrecognised or absent value falls back to a
// mid reading rather than an empty bar, because a blank track next to a skill
// the user deliberately listed reads as "none", which is worse than a guess.
const RATING_SCALE = Object.freeze({
  beginner: 0.4, intermediate: 0.7, expert: 1,
  basic: 0.3, conversational: 0.6, fluent: 0.85, native: 1,
});
const ratingOf = (word) => RATING_SCALE[String(word || '').trim().toLowerCase()] ?? 0.6;

function buildSkillsSection(content, sectionLayouts) {
  const entries = content.skills || [];
  if (!entries.length) return null;

  if (sectionLayouts?.skills?.display === 'rating') {
    return block(T.SECTION, { title: 'Skills' }, [
      block(T.RATING_LIST, {
        items: entries.map((s) => ({ label: s.name, level: ratingOf(s.level), levelLabel: s.level || null })),
        columns: sectionLayouts.skills.columns,
        // 'segmented' draws discrete notches (template 1); 'bar' is continuous.
        barStyle: sectionLayouts.skills.barStyle || 'bar',
      }),
    ]);
  }

  return block(T.SECTION, { title: 'Skills' }, [
    block(T.BULLET_LIST, {
      items: entries.map((s) => (s.level ? `${s.name} (${s.level})` : s.name)),
      bulletStyle: sectionLayouts?.skills?.bulletStyle,
      columns: sectionLayouts?.skills?.columns,
    }),
  ]);
}

function buildLanguagesSection(content, sectionLayouts) {
  const entries = content.languages || [];
  if (!entries.length) return null;
  // Two treatments: the original "English — Fluent" bullet, or a label/value
  // row where the proficiency sits in its own aligned column.
  if (sectionLayouts?.languages?.display === 'rating') {
    return block(T.SECTION, { title: 'Languages' }, [
      block(T.RATING_LIST, {
        items: entries.map((l) => ({ label: l.name, level: ratingOf(l.proficiency), levelLabel: l.proficiency || null })),
        columns: sectionLayouts.languages.columns,
        barStyle: sectionLayouts.languages.barStyle || 'bar',
      }),
    ]);
  }
  if (sectionLayouts?.languages?.display === 'labelValue') {
    return block(T.SECTION, { title: 'Languages' }, [
      block(T.LABEL_VALUE_LIST, {
        items: entries.map((l) => ({ label: l.name, value: l.proficiency })),
        layout: sectionLayouts.languages.rowLayout || 'inline',
        bulletStyle: sectionLayouts.languages.bulletStyle,
      }),
    ]);
  }
  return block(T.SECTION, { title: 'Languages' }, [
    block(T.BULLET_LIST, { items: entries.map((l) => `${l.name} — ${l.proficiency}`) }),
  ]);
}

function buildReferencesSection(content, layout) {
  if (!visible(layout.visibilityRules, 'references', false)) return null;
  const entries = content.references || [];
  if (!entries.length) return null;
  return block(T.SECTION, { title: 'References' }, [
    block(T.BULLET_LIST, {
      items: entries.map((r) => [r.name, r.relationship, r.company, r.phone, r.email].filter(Boolean).join(', ')),
    }),
  ]);
}

const SECTION_BUILDERS = {
  contact: (content) => buildContactSection(content),
  summary: (content, layout) => buildSummarySection(content, layout),
  maritime: (content, layout) => buildMaritimeSection(content, layout.sectionLayouts),
  experience: (content, layout) => buildExperienceSection(content, layout.sectionLayouts),
  education: (content, layout) => buildEducationSection(content, layout.sectionLayouts),
  certificates: (content, layout) => buildCertificatesSection(content, layout.sectionLayouts),
  skills: (content, layout) => buildSkillsSection(content, layout.sectionLayouts),
  languages: (content, layout) => buildLanguagesSection(content, layout.sectionLayouts),
  references: (content, layout) => buildReferencesSection(content, layout),
};

// Lets a template rename a section without touching code — "Profile" vs
// "About Me" vs "Career Objective" is a design decision, not an engine one.
function sectionTitleFor(key, layout, fallback) {
  return layout.sectionTitles?.[key] || fallback || 'Profile';
}

// Builds the sections named in `keys`, in that order, skipping ones the
// template has hidden and ones with nothing to show.
function buildSections(keys, content, layout) {
  const out = [];
  for (const key of keys || []) {
    if (key === 'personal' || key === 'contact:header') continue;
    const builder = SECTION_BUILDERS[key];
    if (!builder) continue;
    if (visible(layout.visibilityRules, key, true) === false) continue;
    const sectionBlock = builder(content, layout);
    if (sectionBlock) {
      // Optional heading glyph, by NAME. Attached here rather than inside each
      // section builder so every section gains it uniformly and no builder has
      // to know the template's icon choices.
      const icon = layout.sectionIcons?.[key];
      if (icon) sectionBlock.props.icon = icon;
      out.push(sectionBlock);
    }
  }
  return out;
}

function buildCustomSections(content) {
  return (content.customSections || []).map((custom) =>
    block(T.SECTION, { title: custom.title }, [block(T.PARAGRAPH, { text: String(custom.content ?? '') })])
  );
}

// ── Single column — the original arrangement, unchanged ────────────────────
function buildSingleColumn(content, layout) {
  const blocks = [];

  const header = buildHeader(content, layout);
  if (header) {
    if ((layout.header?.placement || 'document') === 'banner') header.props.region = REGIONS.BANNER;
    blocks.push(header);
  }

  const objective = buildObjective(content, layout);
  if (objective) blocks.push(objective);

  // 'none' means no divider at all — skipped here rather than left to the
  // painter to no-op, so a template that opts out genuinely renders nothing.
  if ((layout.divider?.style || 'line') !== 'none') {
    blocks.push(block(T.DIVIDER, { style: layout.divider?.style, color: layout.divider?.color }));
  }

  const order = (layout.sectionOrder || []).filter((key) => key !== 'personal' && key !== 'contact');
  blocks.push(...buildSections(order, content, layout));
  blocks.push(...buildCustomSections(content));

  return blocks;
}

// ── Two columns ────────────────────────────────────────────────────────────
// One COLUMNS block holding two independent block stacks. Each column names
// the palette region it is painted in, which is the whole mechanism behind the
// dark sidebar: no block carries a colour, it inherits the region it lands in.
// pdfmake flows both columns across page breaks on its own, so a long resume
// simply continues — verified, not assumed.
function buildTwoColumn(content, layout) {
  const sidebarOn = !!layout.page?.sidebar?.enabled;
  // WHICH column the band is under decides which one takes the sidebar
  // palette. This used to assume the band was always on the left, so a
  // right-hand band painted the LEFT column in sidebar colours (light text on
  // white paper) and the right column in main colours (dark text on the dark
  // band) — every word on the page invisible, in both directions at once.
  const bandOnLeft = (layout.page?.sidebar?.side || 'left') !== 'right';
  const leftRegion = sidebarOn && bandOnLeft ? REGIONS.SIDEBAR : REGIONS.MAIN;
  const rightRegion = sidebarOn && !bandOnLeft ? REGIONS.SIDEBAR : REGIONS.MAIN;

  const placement = layout.header?.placement || 'document';
  // 'banner' lifts the identity block OUT of both columns so it can span the
  // full page width inside the coloured band. The two other placements keep
  // the header inside a column, exactly as before.
  const bannerHeader = placement === 'banner' ? buildHeader(content, layout) : null;

  // 'sidebar' placement means "open the BAND", not "open the left column" —
  // which are the same thing only when the band happens to be on the left.
  const sidebarHeader = placement === 'sidebar' ? buildHeader(content, layout) : null;

  const left = [];
  if (sidebarHeader && bandOnLeft) left.push(sidebarHeader);
  left.push(...buildSections(layout.columns.left, content, layout));

  const right = [];
  if (sidebarHeader && !bandOnLeft) right.push(sidebarHeader);
  if (placement === 'document') {
    const header = buildHeader(content, layout);
    if (header) right.push(header);
  }
  right.push(...buildSections(layout.columns.right, content, layout));
  right.push(...buildCustomSections(content));

  const leftRatio = layout.columns.leftRatio || 0.35;

  const out = [];
  if (bannerHeader) {
    // Painted in the BANNER region so it inherits the band palette (white on
    // colour) without carrying any colour of its own — the same region
    // mechanism the dark sidebar uses.
    bannerHeader.props.region = REGIONS.BANNER;
    out.push(bannerHeader);
  }

  out.push(
    block(
      T.COLUMNS,
      {
        widths: [`${(leftRatio * 100).toFixed(4)}%`, '*'],
        regions: [leftRegion, rightRegion],
        padding: layout.spacing?.columnPadding ?? 24,
        paddingTop: layout.spacing?.columnPaddingTop ?? layout.spacing?.columnPadding ?? 24,
      },
      [left, right]
    )
  );

  return out;
}

// content: resolved, self-contained data from resumeComposer.resolveContent()
// layout:  ResumeTemplate.layout
// Returns: { page, blocks: Block[] }
function buildDocumentModel(content, layout) {
  const twoColumn = (layout.columns?.left || []).length > 0;
  const blocks = twoColumn ? buildTwoColumn(content, layout) : buildSingleColumn(content, layout);

  return {
    page: layout.page || {},
    typography: layout.typography || {},
    colors: layout.colors || {},
    spacing: layout.spacing || {},
    sectionTitle: layout.sectionTitle || {},
    blocks,
  };
}

module.exports = { buildDocumentModel };
