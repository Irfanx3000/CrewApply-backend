'use strict';

const { BLOCK_TYPES: T, block } = require('./blocks');

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

  const contactLine = [contact?.email, contact?.phone, contact?.currentLocation || contact?.city]
    .filter(Boolean)
    .join('  •  ');

  return block(T.HEADER, {
    name: personal.fullName,
    headline: content.maritime?.rank || content.maritime?.designation || content.maritime?.department || null,
    photo: visible(layout.visibilityRules, 'personal.photo', layout.header?.showPhoto) ? personal.avatarUrl : null,
    contactLine,
  });
}

function buildObjective(content, layout) {
  if (!visible(layout.visibilityRules, 'personal.summary', true)) return null;
  const text = content.objectiveOverride || content.careerObjective;
  if (!text) return null;
  return block(T.PARAGRAPH, { text });
}

function buildMaritimeSection(content) {
  const m = content.maritime;
  if (!m) return null;
  const items = [
    m.department && `Department: ${m.department}`,
    m.rank && `Rank: ${m.rank}`,
    m.currentVessel && `Current Vessel: ${m.currentVessel}`,
    m.seaExperienceYears && `Sea Experience: ${m.seaExperienceYears} years`,
    m.availabilityDate && `Available From: ${formatDate(m.availabilityDate)}`,
  ].filter(Boolean);
  if (!items.length) return null;
  return block(T.SECTION, { title: 'Maritime Profile' }, [block(T.BULLET_LIST, { items })]);
}

function buildExperienceSection(content, sectionLayouts) {
  const entries = content.experience || [];
  if (!entries.length) return null;
  const display = sectionLayouts?.experience?.display || 'timeline';

  const items = entries.map((e) =>
    block(T.TIMELINE_ITEM, {
      title: [e.role, e.vesselName || e.company].filter(Boolean).join(' — '),
      subtitle: e.vesselType || e.company || null,
      dateRange: dateRange(e.startDate, e.endDate, e.isCurrent),
    }, e.responsibilities?.length ? [block(T.BULLET_LIST, { items: e.responsibilities })] : [])
  );

  return block(T.SECTION, { title: 'Experience' }, [
    display === 'timeline' ? block(T.TIMELINE, {}, items) : block(T.BULLET_LIST, { items: items.map((i) => i.props.title) }),
  ]);
}

function buildEducationSection(content) {
  const entries = content.education || [];
  if (!entries.length) return null;
  const items = entries.map((e) =>
    block(T.TIMELINE_ITEM, {
      title: [e.degree, e.fieldOfStudy].filter(Boolean).join(', ') || e.institution,
      subtitle: e.institution,
      dateRange: dateRange(e.startDate, e.endDate, false),
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

function buildSkillsSection(content) {
  const entries = content.skills || [];
  if (!entries.length) return null;
  return block(T.SECTION, { title: 'Skills' }, [
    block(T.BULLET_LIST, { items: entries.map((s) => (s.level ? `${s.name} (${s.level})` : s.name)) }),
  ]);
}

function buildLanguagesSection(content) {
  const entries = content.languages || [];
  if (!entries.length) return null;
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
  maritime: (content) => buildMaritimeSection(content),
  experience: (content, layout) => buildExperienceSection(content, layout.sectionLayouts),
  education: (content) => buildEducationSection(content),
  certificates: (content, layout) => buildCertificatesSection(content, layout.sectionLayouts),
  skills: (content) => buildSkillsSection(content),
  languages: (content) => buildLanguagesSection(content),
  references: (content, layout) => buildReferencesSection(content, layout),
};

// content: resolved, self-contained data from resumeComposer.resolveContent()
// layout:  ResumeTemplate.layout
// Returns: { page, blocks: Block[] }
function buildDocumentModel(content, layout) {
  const blocks = [];

  const header = buildHeader(content, layout);
  if (header) blocks.push(header);

  const objective = buildObjective(content, layout);
  if (objective) blocks.push(objective);

  blocks.push(block(T.DIVIDER, { style: layout.divider?.style, color: layout.divider?.color }));

  const order = (layout.sectionOrder || []).filter((key) => key !== 'personal' && key !== 'contact');
  for (const key of order) {
    const builder = SECTION_BUILDERS[key];
    if (!builder) continue;
    if (visible(layout.visibilityRules, key, true) === false) continue;
    const sectionBlock = builder(content, layout);
    if (sectionBlock) blocks.push(sectionBlock);
  }

  for (const custom of content.customSections || []) {
    blocks.push(block(T.SECTION, { title: custom.title }, [block(T.PARAGRAPH, { text: String(custom.content ?? '') })]));
  }

  return {
    page: layout.page || {},
    typography: layout.typography || {},
    colors: layout.colors || {},
    spacing: layout.spacing || {},
    blocks,
  };
}

module.exports = { buildDocumentModel };
