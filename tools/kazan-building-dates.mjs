import { polygonContains } from '../js/footprints.js';

const referenceOf = (b) => `${b.osmType || b.type}/${b.id}`;
const constructionFields = ['start_date', 'building:start_date', 'building:year', 'construction_date', 'year_built'];
const alterationFields = ['reconstruction_date', 'renovation_date', 'building:renovation_date'];

function dateEvidence(field, value) {
  const text = String(value).trim(), approximate = /^(?:~|circa\s*|c\.\s*)/i.test(text);
  const normalized = text.replace(/^(?:~|circa\s*|c\.\s*)/i, '').trim();
  const evidence = { field, text, precision: 'unparsed', qualifier: approximate ? 'approximate' : 'mapped' };
  let match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(normalized);
  if (match) {
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    if (!year || match[2] && (month < 1 || month > 12) || match[3] && (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate())) return evidence;
    evidence.from = evidence.to = year;
    evidence.precision = match[3] ? 'day' : match[2] ? 'month' : 'year';
    return evidence;
  }
  match = /^(\d{4})\s*(?:\.\.|[-–])\s*(\d{4})$/.exec(normalized);
  if (match && Number(match[1]) > 0 && Number(match[2]) >= Number(match[1])) {
    evidence.from = Number(match[1]); evidence.to = Number(match[2]); evidence.precision = 'range'; return evidence;
  }
  match = /^(\d{3})0(?:s|[- ]?е)$/i.exec(normalized);
  if (match) {
    evidence.from = Number(match[1]) * 10; evidence.to = evidence.from + 9; evidence.precision = 'decade'; return evidence;
  }
  match = /^(early\s+|mid\s+|late\s+)?(?:C(\d{1,2})|(\d{1,2})(?:st|nd|rd|th)\s+century)$/i.exec(normalized);
  if (match && Number(match[2] || match[3]) > 0) {
    const start = (Number(match[2] || match[3]) - 1) * 100 + 1, position = match[1]?.trim().toLowerCase();
    evidence.from = start + (position === 'mid' ? 33 : position === 'late' ? 66 : 0);
    evidence.to = start + (position === 'early' ? 32 : position === 'mid' ? 65 : 99);
    evidence.precision = position ? 'partial-century' : 'century'; return evidence;
  }
  match = /^(before\s+|after\s+|[<>])\s*(\d{4})$/i.exec(normalized);
  if (match && Number(match[2]) > 0) {
    const before = /^(before|<)/i.test(match[1]);
    evidence[before ? 'to' : 'from'] = Number(match[2]) + (before ? -1 : 1);
    evidence.precision = before ? 'before-year' : 'after-year';
  }
  return evidence;
}

const evidenceOf = (tags, fields) => fields.filter((field) => tags[field] !== undefined && String(tags[field]).trim())
  .map((field) => dateEvidence(field, tags[field]));

function conflicting(evidence) {
  const intervals = evidence.filter((e) => e.precision !== 'unparsed' && e.qualifier !== 'approximate');
  return intervals.length > 1 && Math.max(...intervals.map((e) => e.from ?? -Infinity)) > Math.min(...intervals.map((e) => e.to ?? Infinity));
}

/** Preserve construction evidence for every mapped source identity; eras consume this shared layer without network work. */
export function compileBuildingDates(elements, buildings, { cityGeometry, toWorld, source }) {
  const polygons = (cityGeometry.type === 'Polygon' ? [cityGeometry.coordinates] : cityGeometry.coordinates)
    .map((polygon) => polygon.map((ring) => ring.flatMap(([lon, lat]) => toWorld({ lon, lat }))));
  const raw = new Map(elements.map((e) => [referenceOf(e), e.tags || {}])), byReference = new Map();
  for (const b of buildings) {
    const reference = referenceOf(b);
    if (byReference.has(reference)) continue;
    const tags = raw.get(reference) || {}, construction = evidenceOf(tags, constructionFields), alterations = evidenceOf(tags, alterationFields);
    if (!construction.length && !alterations.length && !tags['building:architecture']) continue;
    const record = { reference, construction, alterations };
    if (tags['building:architecture']) record.architecture = tags['building:architecture'];
    if (conflicting(construction)) record.conflict = true;
    byReference.set(reference, record);
  }
  const inherited = new Map();
  for (const b of buildings) {
    if (!b.part || !b.parent || byReference.get(referenceOf(b))?.construction.length) continue;
    const parent = byReference.get(b.parent);
    if (parent?.construction.length) inherited.set(referenceOf(b), b.parent);
  }
  function counts(selected) {
    const references = [...new Set(selected.filter((b) => !b.part).map(referenceOf))], kinds = {};
    for (const b of selected) {
      if (b.part) continue;
      const kind = b.kind || 'unknown';
      kinds[kind] ??= { bodies: 0, withDate: 0 };
      kinds[kind].bodies++;
      if (byReference.get(referenceOf(b))?.construction.length) kinds[kind].withDate++;
    }
    const records = references.map((ref) => byReference.get(ref)).filter(Boolean);
    const usable = records.filter((r) => !r.conflict && r.construction.some((e) => e.precision !== 'unparsed'));
    return { principalBodies: selected.filter((b) => !b.part).length, principalReferences: references.length,
      withSourceConstructionDate: records.filter((r) => r.construction.length).length,
      withParsedConstructionDate: usable.length,
      missingConstructionDate: references.filter((ref) => !byReference.get(ref)?.construction.length).length,
      conflictingDates: records.filter((r) => r.conflict).length,
      unparsedDates: records.filter((r) => r.construction.length && r.construction.every((e) => e.precision === 'unparsed')).length,
      qualifiedDates: usable.filter((r) => r.construction.some((e) => e.qualifier === 'approximate' || !['year', 'month', 'day'].includes(e.precision))).length,
      exact1932to1959Candidates: usable.filter((r) => r.construction.some((e) => e.qualifier === 'mapped' &&
        ['year', 'month', 'day'].includes(e.precision) && e.from >= 1932 && e.to <= 1959)).length,
      architectureTags: records.filter((r) => r.architecture).length,
      inheritedPartReferences: new Set(selected.filter((b) => b.part && inherited.has(referenceOf(b))).map(referenceOf)).size,
      byKind: kinds };
  }
  const municipal = buildings.filter((b) => polygons.some((p) => polygonContains(p[0], b.ring[0], b.ring[1]) &&
    !p.slice(1).some((hole) => polygonContains(hole, b.ring[0], b.ring[1]))));
  return { version: 1, source: { name: 'OpenStreetMap', license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors',
    url: 'https://www.openstreetmap.org/copyright', extract: source }, records: [...byReference.values()],
    inheritedParts: [...inherited].map(([reference, parent]) => ({ reference, parent })),
    coverage: { regional: counts(buildings), municipal: counts(municipal) },
    note: 'Construction dates are mapped evidence, not architectural classification. Original text, approximation, intervals, unparsed values and alterations remain separate. Missing records have unknown dates; inherited dates apply only to mapped parts. Municipal membership uses the source outline anchor. Coverage is mapped building records/source identities, not a cadastral census.' };
}
