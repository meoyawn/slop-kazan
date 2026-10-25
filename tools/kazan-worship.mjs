import polygonClipping from 'polygon-clipping';
import { polygonContains, polygonBounds } from '../js/footprints.js';

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

const denominationOf = (t) => /^(orthodox|russian_orthodox|greek_orthodox)$/.test(t.denomination || '') ? 'orthodox' : t.denomination || null;
const sharedUse = (kind) => /^(apartments|residential|office|commercial|dormitory|school|kindergarten|university|college|hospital|clinic|train_station|retail|mall|industrial)$/.test(kind);
const prayerRoom = (t) => t.level !== undefined || t['addr:floor'] !== undefined || t.indoor === 'room' || /молел|молель|prayer.?room/i.test(t.name || '');

/** Religious families retain source identity, mapped complex ownership and the distinction between observed and inferred styles. */
export function compileWorship(elements, helpers, buildings, catalogue = {}) {
  const sources = [...new Map(elements.map((e) => [keyOf(e),e])).values()];
  const tags = new Map(sources.map((e) => [keyOf(e), e.tags || {}])), sites = [], bindings = [], gaps = [], pointRecords = [];
  const principals = buildings.filter((b) => !b.part).map((b) => ({b,bounds:polygonBounds(b.ring)})), identities = new Map();
  for (const e of sources.filter((e) => e.type === 'node')) {
    const t = e.tags || {};
    if (t.amenity !== 'place_of_worship' && !['minaret','bell_tower'].includes(t['tower:type']) && !t.building) continue;
    const [x,z] = helpers.toWorld(e);
    const owners = [...new Map(principals.filter(({b,bounds:s}) => x>=s.minX && x<=s.maxX && z>=s.minZ && z<=s.maxZ && polygonContains(b.ring,x,z) && !b.holes.some((r) => polygonContains(r,x,z))).map(({b}) => [keyOf(b),b])).values()];
    const record = {reference:keyOf(e),x,z,name:t.name || '',kind:t['tower:type'] || (t.amenity === 'place_of_worship' ? 'place-of-worship' : 'point-building'),
      faith:faith(t),religion:t.religion || null,denomination:t.denomination || null,height:t.height || null,owner:owners.length===1 ? keyOf(owners[0]) : null,
      status:owners.length===1 ? 'contained-unconfirmed-envelope' : owners.length ? 'ambiguous-envelope' : 'point-only',
      ...(owners.length>1 ? {candidates:owners.map(keyOf)} : {})};
    pointRecords.push(record);
    if (owners.length!==1) continue;
    const owner=owners[0],reference=keyOf(owner);
    if (t.amenity !== 'place_of_worship') continue;
    if (sharedUse(owner.kind) || prayerRoom(t)) {record.status='shared-envelope';continue;}
    if (!identities.has(reference)) identities.set(reference,[]);
    identities.get(reference).push({record,tags:t});
  }
  for (const e of sources) {
    const t = e.tags || {}, religion = faith(t);
    if (t.building || !(t.amenity === 'monastery' || t.landuse === 'religious')) continue;
    if (!religion) {gaps.push({reference:keyOf(e),reason:'religious property denomination not established'});continue;}
    if (e.type==='relation' && t.type==='site') {gaps.push({reference:keyOf(e),reason:'site relation is identity context, not a property polygon'});continue;}
    if (e.type==='way' && (!e.geometry?.length || e.geometry[0].lon!==e.geometry.at(-1).lon || e.geometry[0].lat!==e.geometry.at(-1).lat)) {
      gaps.push({reference:keyOf(e),reason:'open property way retained without inventing its boundary'});continue;
    }
    const rings = e.type === 'way' ? [helpers.closedRing(e.geometry)] : e.type === 'relation' ? helpers.joinMembers(e.members, 'outer').map((r) => helpers.closedRing(r)) : [];
    const holes = e.type === 'relation' ? helpers.joinMembers(e.members, 'inner').map((r) => helpers.closedRing(r)) : [];
    for (const ring of rings.filter((r) => r.length > 2)) sites.push({ reference: keyOf(e), name: t.name || '', faith: religion,
      ring: ring.flat(), holes: holes.map((r) => r.flat()), denomination:t.denomination || null,
      boundarySource: 'mapped-religious-property', kind: t.amenity || 'religious', bodies: [] });
  }
  for (const s of sites) {
    const xs = points(s.ring).map((p) => p[0]), zs = points(s.ring).map((p) => p[1]);
    s.bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  }
  const classified = new Set();
  for (const {b} of principals) {
    if (classified.has(keyOf(b))) continue;
    classified.add(keyOf(b));
    const reference = keyOf(b), t = tags.get(reference) || {}, poly = polygon(b), size = area(poly[0]);
    const containingSites = sites.filter((s) => {
      if (b.ring[0] < s.bounds.minX || b.ring[0] > s.bounds.maxX || b.ring[1] < s.bounds.minZ || b.ring[1] > s.bounds.maxZ) return false;
      const overlap = polygonClipping.intersection([poly], [polygon(s)]).reduce((n, p) => n + area(p[0]) - p.slice(1).reduce((v, r) => v + area(r), 0), 0);
      return Math.abs(overlap - (size - poly.slice(1).reduce((n, r) => n + area(r), 0))) < Math.max(0.02, size * 1e-6);
    });
    const directFaith = faith(t), candidates = identities.get(reference) || [];
    const pointFaiths = new Set(candidates.map((p) => p.record.faith).filter(Boolean)), pointDenominations = new Set(candidates.map((p) => denominationOf(p.tags)).filter(Boolean));
    const conflictingPoints = pointFaiths.size>1 || pointDenominations.size>1 || candidates.some((p) =>
      t.religion && p.tags.religion && t.religion!==p.tags.religion || t.denomination && p.tags.denomination && denominationOf(t)!==denominationOf(p.tags) ||
      /^(church|cathedral|chapel)$/.test(b.kind) && p.record.faith==='mosque' || b.kind==='mosque' && p.record.faith==='orthodox');
    const religiousKind = /^(church|cathedral|chapel|mosque|religious|bell_tower)$/.test(b.kind);
    const supportedPoints = !conflictingPoints && (religiousKind || t.amenity==='place_of_worship') ? candidates.filter((p) => p.record.faith) : [];
    const pointFaith = supportedPoints[0]?.record.faith;
    const religion = directFaith || pointFaith;
    const matchingSites = containingSites.filter((s) => !religion || s.faith===religion);
    const site = new Set(matchingSites.map((s) => s.faith)).size===1 ? matchingSites[0] : null;
    if (conflictingPoints) {
      for(const p of candidates)p.record.status='conflicting-source-identity';
      gaps.push({reference,reason:'contained source points disagree on religion or denomination'});
      if(!directFaith)continue;
    }
    if (!religion && !site) {
      if (religiousKind) gaps.push({ reference, reason: 'religion/Orthodox denomination not established' });
      continue;
    }
    if (site) site.bodies.push(reference);
    const worshipUse = religiousKind || t.amenity === 'place_of_worship' || ['minaret', 'bell_tower'].includes(t['tower:type']);
    if (t.denomination && !religion || t.religion && !['muslim', 'christian'].includes(t.religion)) {
      gaps.push({ reference, reason: 'other or unspecified denomination retained within the mapped property' }); continue;
    }
    if (!worshipUse && religion || sharedUse(b.kind)) {
      gaps.push({ reference, reason: 'religious affiliation does not change this building into a place of worship' }); continue;
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
      name:t.name || supportedPoints[0]?.tags.name || b.localName || b.name || '',
      denomination:t.denomination || supportedPoints[0]?.tags.denomination || site?.denomination || null,
      identityPoints:supportedPoints.map((p) => p.record.reference),
      role: t['tower:type'] === 'minaret' ? 'minaret' : t['tower:type'] === 'bell_tower' || b.kind === 'bell_tower' ? 'bell-tower' :
        family === 'monastery-wing' ? 'auxiliary' : 'principal',
      style: { ...profile, ...assignment }, styleSource: assignment ? 'photographic-family-sample' : 'mapped-material-and-procedural-family',
      altarAxis: family === 'orthodox' ? { x: dx, z: dz, source: 'footprint-axis-eastward-estimate', note: 'Mapped apses retained; axis is an estimate, not a surveyed altar bearing.' } : undefined,
      reviewedModel: b.model, source: { religion: t.religion, denomination: t.denomination, height: b.heightSource,
        roofShape:t['roof:shape'] || null, roofHeight:t['roof:height'] || null,
        wallColour: b.colourSource || (t['building:colour'] ? 'osm-colour' : b.colour ? 'reviewed-observation' : 'family-estimate'), roofColour: b.roofColour ? 'source-or-reviewed' : 'family-estimate' } });
  }
  const parents = new Map(bindings.map((b) => [b.reference, b]));
  for (const b of buildings.filter((b) => b.part)) {
    const parent = parents.get(b.parent); if (!parent) continue;
    const t=tags.get(keyOf(b)) || {};
    bindings.push({ ...parent, reference: keyOf(b), parent: b.parent, role: b.towerType === 'minaret' ? 'minaret' : 'mapped-part', reviewedModel: b.model,
      source:{...parent.source,height:b.heightSource,roofShape:t['roof:shape'] || null,roofHeight:t['roof:height'] || null} });
  }
  for(const p of pointRecords){
    if(p.status!=='contained-unconfirmed-envelope')continue;
    const owner=parents.get(p.owner);
    if(owner && (p.kind!=='place-of-worship' || owner.identityPoints.includes(p.reference)))p.status=p.kind==='place-of-worship' ? 'matched-worship-building' : 'mapped-tower-point';
  }
  return { bindings, sites, gaps, points:pointRecords, catalogue, coverage: { principals: bindings.filter((b) => !b.parent && b.role !== 'auxiliary').length,
    parts: bindings.filter((b) => b.parent).length, auxiliaryBodies: bindings.filter((b) => !b.parent && b.role === 'auxiliary').length,
    mappedProperties: sites.length, identityGaps: gaps.length,sourcePoints:pointRecords.length,
    matchedWorshipPoints:pointRecords.filter((p) => p.status==='matched-worship-building').length,
    sharedEnvelopePoints:pointRecords.filter((p) => p.status==='shared-envelope').length,
    pointOnly:pointRecords.filter((p) => p.status==='point-only').length },
    note: 'Mapped religious buildings/complexes, not a congregation census. Unspecified Christian denominations and shared envelopes are preserved. Unobserved family forms/colours are estimates, not satellite measurements.' };
}
