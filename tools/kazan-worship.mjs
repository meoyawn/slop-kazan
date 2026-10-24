import polygonClipping from 'polygon-clipping';

const keyOf = (e) => `${e.osmType || e.type}/${e.id}`;
const points = (r) => Array.from({ length: r.length / 2 }, (_, i) => r.slice(i * 2, i * 2 + 2));
const polygon = (b) => [points(b.ring), ...b.holes.map(points)];

function area(p) {
  let value = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) value += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return Math.abs(value) / 2;
}

function faith(t) {
  if (t.religion === 'muslim' || t.building === 'mosque' || t['tower:type'] === 'minaret') return 'mosque';
  if (t.religion === 'christian' && /^(orthodox|russian_orthodox|greek_orthodox|old_believers)$/.test(t.denomination || '')) return 'orthodox';
  return null;
}

/** Religious families retain source identity, mapped complex ownership and the distinction between observed and inferred styles. */
export function compileWorship(elements, helpers, buildings, catalogue = {}) {
  const tags = new Map(elements.map((e) => [keyOf(e), e.tags || {}])), sites = [], bindings = [], gaps = [];
  for (const e of elements) {
    const t = e.tags || {}, religion = faith(t);
    if (!religion || t.building || !(t.amenity === 'monastery' || t.landuse === 'religious')) continue;
    const rings = e.type === 'way' ? [helpers.closedRing(e.geometry)] : e.type === 'relation' ? helpers.joinMembers(e.members, 'outer').map((r) => helpers.closedRing(r)) : [];
    const holes = e.type === 'relation' ? helpers.joinMembers(e.members, 'inner').map((r) => helpers.closedRing(r)) : [];
    for (const ring of rings.filter((r) => r.length > 2)) sites.push({ reference: keyOf(e), name: t.name || '', faith: religion,
      ring: ring.flat(), holes: holes.map((r) => r.flat()), boundarySource: 'mapped-religious-property', kind: t.amenity || 'religious', bodies: [] });
  }
  for (const s of sites) {
    const xs = points(s.ring).map((p) => p[0]), zs = points(s.ring).map((p) => p[1]);
    s.bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  }
  for (const b of buildings.filter((b) => !b.part)) {
    const reference = keyOf(b), t = tags.get(reference) || {}, poly = polygon(b), size = area(poly[0]);
    const site = sites.find((s) => {
      if (b.ring[0] < s.bounds.minX || b.ring[0] > s.bounds.maxX || b.ring[1] < s.bounds.minZ || b.ring[1] > s.bounds.maxZ) return false;
      const overlap = polygonClipping.intersection([poly], [polygon(s)]).reduce((n, p) => n + area(p[0]) - p.slice(1).reduce((v, r) => v + area(r), 0), 0);
      return Math.abs(overlap - (size - poly.slice(1).reduce((n, r) => n + area(r), 0))) < Math.max(0.02, size * 1e-6);
    });
    const religion = faith(t), religiousKind = /^(church|cathedral|chapel|mosque|religious|bell_tower)$/.test(b.kind);
    if (!religion && !site) {
      if (religiousKind) gaps.push({ reference, reason: 'religion/Orthodox denomination not established' });
      continue;
    }
    if (site) site.bodies.push(reference);
    const worshipUse = religiousKind || t.amenity === 'place_of_worship' || ['minaret', 'bell_tower'].includes(t['tower:type']);
    if (t.denomination && !religion || t.religion && !['muslim', 'christian'].includes(t.religion)) {
      gaps.push({ reference, reason: 'other or unspecified denomination retained within the mapped property' }); continue;
    }
    if (!worshipUse && religion || /^(school|kindergarten|university|college|hospital|clinic)$/.test(b.kind)) {
      gaps.push({ reference, reason: 'religious affiliation does not change this building into a place of worship' }); continue;
    }
    if (/^(apartments|residential|office|commercial|dormitory)$/.test(b.kind)) {
      gaps.push({ reference, reason: 'shared occupied envelope retained' }); continue;
    }
    const assignment = catalogue.assignments?.[reference], family = religion || (religiousKind ? site.faith : 'monastery-wing');
    const profile = catalogue.families?.[assignment?.style || (family === 'mosque' ? /wood|timber/.test(b.material) ? 'tatar-timber' :
      /brick/.test(b.material) ? 'tatar-brick' : 'tatar-plaster' : /brick/.test(b.material) ? 'orthodox-brick' : /wood|timber/.test(b.material) ? 'orthodox-timber' : 'orthodox-plaster')] || {};
    const pts = points(b.ring); let dx = 1, dz = 0, longest = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length], d = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (d > longest) { longest = d; const sign = c[0] >= a[0] ? 1 : -1; dx = (c[0] - a[0]) * sign / d; dz = (c[1] - a[1]) * sign / d; }
    }
    bindings.push({ reference, faith: religion || site.faith, family, site: site?.reference,
      role: t['tower:type'] === 'minaret' ? 'minaret' : t['tower:type'] === 'bell_tower' || b.kind === 'bell_tower' ? 'bell-tower' :
        family === 'monastery-wing' ? 'auxiliary' : 'principal',
      style: { ...profile, ...assignment }, styleSource: assignment ? 'photographic-family-sample' : 'mapped-material-and-procedural-family',
      altarAxis: religion === 'orthodox' ? { x: dx, z: dz, source: 'footprint-axis-eastward-estimate', note: 'Mapped apses retained; axis is an estimate, not a surveyed altar bearing.' } : undefined,
      reviewedModel: b.model, source: { religion: t.religion, denomination: t.denomination, height: b.heightSource,
        wallColour: b.colourSource || (t['building:colour'] ? 'osm-colour' : b.colour ? 'reviewed-observation' : 'family-estimate'), roofColour: b.roofColour ? 'source-or-reviewed' : 'family-estimate' } });
  }
  const parents = new Map(bindings.map((b) => [b.reference, b]));
  for (const b of buildings.filter((b) => b.part)) {
    const parent = parents.get(b.parent); if (!parent) continue;
    bindings.push({ ...parent, reference: keyOf(b), parent: b.parent, role: b.towerType === 'minaret' ? 'minaret' : 'mapped-part', reviewedModel: b.model });
  }
  return { bindings, sites, gaps, catalogue, coverage: { principals: bindings.filter((b) => !b.parent && b.role !== 'auxiliary').length,
    parts: bindings.filter((b) => b.parent).length, auxiliaryBodies: bindings.filter((b) => !b.parent && b.role === 'auxiliary').length,
    mappedProperties: sites.length, identityGaps: gaps.length },
    note: 'Mapped religious buildings/complexes, not a congregation census. Unspecified Christian denominations and shared envelopes are preserved. Unobserved family forms/colours are estimates, not satellite measurements.' };
}
