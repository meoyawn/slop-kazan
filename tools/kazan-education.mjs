import { createParkingIndex } from './kazan-parking.mjs';
import { classifyFacade } from './kazan-facades.mjs';

const keyOf = (e) => `${e.osmType || e.type}/${e.id}`;
const kinds = new Set(['school', 'kindergarten']);

function inside(ring, x, z, tolerance = 0.25) {
  let result = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const dx = ring[i] - ring[j], dz = ring[i + 1] - ring[j + 1];
    const t = Math.max(0, Math.min(1, ((x - ring[j]) * dx + (z - ring[j + 1]) * dz) / (dx * dx + dz * dz || 1)));
    if (Math.hypot(x - ring[j] - t * dx, z - ring[j + 1] - t * dz) <= tolerance) return true;
    if ((ring[i + 1] > z) !== (ring[j + 1] > z) && x < dx * (z - ring[j + 1]) / dz + ring[j]) result = !result;
  }
  return result;
}

function inProperty(site, point) {
  return site.rings.some((r) => inside(r, ...point)) && !site.holes.some((r) => inside(r, ...point, 0));
}

function pointsOf(ring) {
  return Array.from({ length: ring.length / 2 }, (_, i) => ring.slice(i * 2, i * 2 + 2));
}

function ringArea(ring) {
  let value = 0;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) value += ring[j] * ring[i + 1] - ring[i] * ring[j + 1];
  return Math.abs(value) / 2;
}

function centre(points) {
  return [points.reduce((sum, p) => sum + p[0], 0) / points.length,
    points.reduce((sum, p) => sum + p[1], 0) / points.length];
}

/** Describe mapped massing and materials without claiming an architectural catalogue series. */
function familyOf(b, tags) {
  if (b.typology && !['small-building', 'retail-pavilion'].includes(b.typology)) return { family: b.typology, evidence: 'footprint-template-match', templateReference: b.typologyReference };
  const points = pointsOf(b.ring), xs = points.map((p) => p[0]), zs = points.map((p) => p[1]);
  let length = 0, ux = 1, uz = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], c = points[(i + 1) % points.length], d = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (d > length) { length = d; ux = (c[0] - a[0]) / d; uz = (c[1] - a[1]) / d; }
  }
  const u = points.map(([x, z]) => (x - xs[0]) * ux + (z - zs[0]) * uz);
  const v = points.map(([x, z]) => -(x - xs[0]) * uz + (z - zs[0]) * ux);
  const occupancy = ringArea(b.ring) / Math.max(1, (Math.max(...u) - Math.min(...u)) * (Math.max(...v) - Math.min(...v)));
  const form = b.holes.length ? 'courtyard' : occupancy < 0.7 && points.length > 6 ? 'winged' : 'block';
  const material = /brick/.test(tags['building:material'] || b.material) ? 'brick' : /panel|concrete/.test(tags['building:material'] || b.material) ? 'panel' : 'plaster';
  return { family: `${material}-${form}`, evidence: 'procedural-inference', occupancy: Math.round(occupancy * 1000) / 1000 };
}

/** Classroom families follow physical school ownership; reviewed envelopes and shared residential buildings keep their appearance. */
export function applySchoolFacades(education, buildings, tags, profiles) {
  const byBody = new Map(buildings.map((b) => [keyOf(b), b])), families = {};
  let teaching = 0, sportsHalls = 0, reviewed = 0, inheritedParts = 0, sharedEnvelopes = 0;
  for (const site of education.sites.filter((s) => s.kind === 'school')) for (const body of site.bodies) {
    if (!['teaching', 'sports-hall'].includes(body.role)) continue;
    const b = byBody.get(body.reference);
    if (!b) continue;
    if (body.role === 'teaching') teaching++; else sportsHalls++;
    const source = tags.get(body.reference) || {};
    const shared = /^(apartments|residential|dormitory|office|commercial)$/.test(b.kind) && source.amenity !== 'school';
    if (shared) { sharedEnvelopes++; continue; }
    if (!b.appearance && !b.model) {
      const facade = classifyFacade({ ...source, building: b.kind, amenity: 'school',
        ...(body.role === 'sports-hall' ? { leisure: 'sports_hall' } : {}) }, null, profiles);
      if (facade) {
        b.appearance = facade.appearance; b.colour = facade.appearance.wallColour;
        b.colourSource = facade.source; b.facadeFamily = facade.family; b.facadeConfidence = facade.confidence;
      }
    }
    body.facadeProfile = b.facadeFamily; body.colourSource = b.colourSource;
    if (b.facadeConfidence === 'reviewed' || b.model) reviewed++;
    if (b.facadeFamily) families[b.facadeFamily] = (families[b.facadeFamily] || 0) + 1;
  }
  for (const binding of education.bindings.filter((v) => v.role === 'mapped-part')) {
    const b = byBody.get(binding.reference), parent = byBody.get(binding.parent);
    if (!b || !parent?.facadeFamily?.startsWith('school-') || b.appearance || b.model || /glass/.test(b.material) || b.kind === 'roof') continue;
    const colour = tags.get(binding.reference)?.['building:colour'] || tags.get(binding.reference)?.colour;
    b.appearance = { ...parent.appearance, ...(colour ? { wallColour: colour } : {}) };
    b.colour = b.appearance.wallColour; b.colourSource = colour ? 'osm-colour' : 'school-body-inheritance';
    b.facadeFamily = parent.facadeFamily; b.facadeConfidence = colour ? 'mapped' : 'inferred'; inheritedParts++;
  }
  return { teachingBodies: teaching, sportsHallBodies: sportsHalls, reviewedOrModelledBodies: reviewed,
    sharedEnvelopesPreserved: sharedEnvelopes, inheritedParts, families };
}

/** Canonical mapped educational boundaries serve both access routing and the component inventory. */
export function compileEducationProperties(elements, { closedRing, joinMembers }) {
  const byKey = new Map(elements.filter((e) => kinds.has(e.tags?.amenity) || e.tags?.landuse === 'education').map((e) => [keyOf(e), e]));
  const properties = [], issues = [];
  for (const e of elements) {
    const t = e.tags || {};
    if (t.building || !kinds.has(t.amenity) && t.landuse !== 'education') continue;
    if (e.type === 'relation' && t.type !== 'multipolygon') continue;
    let outer, inner;
    try {
      outer = e.type === 'way' ? [closedRing(e.geometry)] : e.type === 'relation' ? joinMembers(e.members, 'outer').map((g) => closedRing(g)) : [];
      inner = e.type === 'relation' ? joinMembers(e.members, 'inner').map((g) => closedRing(g)) : [];
    } catch (error) { issues.push({ reference: keyOf(e), issue: error.message }); continue; }
    const rings = outer.filter((r) => r.length > 2).map((r) => r.flat());
    if (!rings.length) continue;
    properties.push({ id: e.id, osmType: e.type, reference: keyOf(e), kind: kinds.has(t.amenity) ? t.amenity : 'education',
      name: t.name || '', rings, holes: inner.filter((r) => r.length > 2).map((r) => r.flat()), area: rings.reduce((n, r) => n + ringArea(r), 0) });
  }
  const propertyAliases = new Map();
  for (const p of properties.filter((p) => p.osmType === 'relation')) {
    for (const member of byKey.get(p.reference).members) {
      const reference = `${member.type}/${member.ref}`, t = byKey.get(reference)?.tags || {};
      if (member.type === 'way' && (!member.role || member.role === 'outer') &&
        (t.amenity === p.kind || t.landuse === 'education')) propertyAliases.set(reference, p);
    }
  }
  properties.sort((a, b) => a.area - b.area || Number(a.kind === 'education') - Number(b.kind === 'education') || a.reference.localeCompare(b.reference));
  const canonical = [];
  for (const p of properties) {
    if (propertyAliases.has(p.reference)) continue;
    const duplicate = canonical.find((c) => (c.kind === p.kind || p.kind === 'education') && c.holes.length === p.holes.length &&
      Math.abs(c.area - p.area) < Math.max(0.5, p.area * 0.005) && p.rings.every((r) => pointsOf(r).every((v) => inProperty(c, v))) &&
      c.rings.every((r) => pointsOf(r).every((v) => inProperty(p, v))));
    if (duplicate) propertyAliases.set(p.reference, duplicate);
    else canonical.push(p);
  }
  return { properties, canonical, propertyAliases, issues };
}

/** Physical properties group POIs and component buildings; unknown yards retain no invented boundary. */
export function compileEducation(source, supplement, helpers, buildings) {
  const { toWorld, closedRing, joinMembers, cityGeometry } = helpers;
  const elements = [...new Map([...source, ...supplement].map((e) => [keyOf(e), e])).values()];
  const byKey = new Map(elements.map((e) => [keyOf(e), e]));
  const parents = buildings.filter((b) => !b.part), buildingByKey = new Map(parents.map((b) => [keyOf(b), b]));
  const { properties, canonical, propertyAliases, issues } = compileEducationProperties(elements, helpers);
  const propertyIndex = createParkingIndex(canonical), bodyIndex = createParkingIndex(parents.map((b) => ({ id: b.id, osmType: b.osmType, rings: [b.ring], holes: b.holes })));
  const sites = new Map(), aliasSites = new Map(), excluded = [];
  function identity(e) {
    const t = e.tags || {}, ownKind = kinds.has(t.amenity) ? t.amenity : kinds.has(t.building) ? t.building : null;
    if (!ownKind) return;
    if (t.amenity && !kinds.has(t.amenity)) { excluded.push({ reference: keyOf(e), kind: t.amenity }); return; }
    const body = buildingByKey.get(keyOf(e));
    const points = body ? pointsOf(body.ring) : e.type === 'node' ? [toWorld(e)] : properties.find((p) => p.reference === keyOf(e))?.rings.flatMap(pointsOf) || [];
    if (!points.length) { issues.push({ reference: keyOf(e), issue: 'identity has no usable point, building or property geometry' }); return; }
    const mid = centre(points), property = propertyAliases.get(keyOf(e)) || properties.find((p) => p.reference === keyOf(e)) ||
      [propertyIndex.at(...mid), ...points.map((p) => propertyIndex.at(...p))].find((p) => p && points.filter((v) => inProperty(p, v)).length >= points.length * 0.6);
    const kind = property && kinds.has(property.kind) && !kinds.has(t.amenity) ? property.kind : ownKind;
    const containingBody = body || (e.type === 'node' ? bodyIndex.at(...mid) : null);
    const reference = property?.reference || (containingBody ? keyOf(containingBody) : keyOf(e));
    const id = `${reference}/${kind}`;
    if (!sites.has(id)) sites.set(id, { id, kind, reference, name: property?.kind === kind ? property.name || t.name || '' : t.name || '', aliases: [],
      x: mid[0], z: mid[1], rings: property?.rings || [], holes: property?.holes || [],
      boundarySource: property ? 'mapped-property' : 'unknown', boundaryKind: property?.kind,
      sharedProperty: !!property && property.kind !== kind,
      source: `https://www.openstreetmap.org/${reference}`, bodies: [], features: [], entrances: [] });
    const site = sites.get(id);
    if (t.name && !site.name) site.name = t.name;
    if (!site.aliases.includes(keyOf(e))) site.aliases.push(keyOf(e));
    aliasSites.set(keyOf(e), site);
    if (containingBody) aliasSites.set(keyOf(containingBody), site);
  }
  for (const e of elements.filter((e) => kinds.has(e.tags?.amenity))) identity(e);
  for (const b of parents.filter((b) => kinds.has(b.kind))) identity(byKey.get(keyOf(b)) || { type: b.osmType, id: b.id, tags: { building: b.kind } });

  const bounded = [...sites.values()].filter((s) => s.rings.length), boundedIndex = createParkingIndex(bounded);
  const bindings = [];
  for (const b of parents) {
    const reference = keyOf(b), t = byKey.get(reference)?.tags || {}, points = pointsOf(b.ring), mid = centre(points);
    const candidate = aliasSites.get(reference) || boundedIndex.at(...mid) || points.map((p) => boundedIndex.at(...p)).find(Boolean);
    if (!candidate || !aliasSites.has(reference) && points.filter((p) => inProperty(candidate, p)).length < points.length * 0.6) continue;
    if (t.amenity && ['kindergarten', 'university', 'college', 'music_school', 'driving_school'].includes(t.amenity) && t.amenity !== candidate.kind) continue;
    const role = t.sport || /sports_hall|sports_centre/.test(t.leisure || '') ? 'sports-hall' :
      kinds.has(t.building) || kinds.has(t.amenity) || aliasSites.has(reference) ? 'teaching' :
        /shed|garage|service|transformer/.test(t.building || '') ? 'service' : 'unclassified-annex';
    if (candidate.bodies.some((v) => v.reference === reference)) continue;
    const family = familyOf(b, t);
    candidate.bodies.push({ reference, role, roleSource: role === 'unclassified-annex' ? 'unknown' : 'mapped-tags',
      ...family, levels: b.levels, heightSource: b.heightSource, roofShape: b.roofShape, roofHeight: b.roofHeight,
      constructionStage: b.construction?.stage, material: t['building:material'] || b.material || 'unknown',
      colourSource: b.colourSource || 'unknown', facadeProfile: b.facadeFamily, observedModel: b.model });
    bindings.push({ reference, site: candidate.id, role });
  }
  const ownerByBody = new Map(bindings.map((b) => [b.reference, b]));
  for (const b of buildings.filter((b) => b.part && b.parent)) {
    const owner = ownerByBody.get(b.parent);
    if (owner) bindings.push({ reference: keyOf(b), site: owner.site, role: 'mapped-part', parent: b.parent });
  }
  const barrierNodes = new Map();
  for (const way of elements.filter((e) => e.type === 'way' && e.tags?.barrier)) for (const node of way.nodes || []) {
    if (!barrierNodes.has(node)) barrierNodes.set(node, []);
    if (!barrierNodes.get(node).includes(keyOf(way))) barrierNodes.get(node).push(keyOf(way));
  }
  for (const e of elements) {
    const t = e.tags || {}, feature = !t.building && ['pitch', 'track', 'playground', 'fitness_station', 'sports_centre', 'sports_hall', 'swimming_pool'].includes(t.leisure);
    const entrance = t.entrance && t.entrance !== 'no', barrier = !!t.barrier;
    if (!feature && !entrance && !barrier) continue;
    const points = e.type === 'node' ? [toWorld(e)] : e.type === 'way' ? e.geometry?.map(toWorld) : null;
    if (!points?.length) continue;
    const mid = centre(points);
    let site = boundedIndex.at(...mid) || points.map((p) => boundedIndex.at(...p)).find(Boolean) || bounded.find((s) => points.some((p) => inProperty(s, p)));
    if (!site && entrance) {
      for (const [dx, dz] of [[0, 0], [-0.2, 0], [0.2, 0], [0, -0.2], [0, 0.2]]) {
        const body = bodyIndex.at(mid[0] + dx, mid[1] + dz), owner = body && ownerByBody.get(keyOf(body));
        if (owner) { site = sites.get(owner.site); break; }
      }
    }
    if (!site || site.rings.length && !points.some((p) => inProperty(site, p))) continue;
    const record = { reference: keyOf(e), kind: feature ? t.leisure : entrance ? 'entrance' : t.barrier,
      ...(entrance ? { entranceType: t.entrance, level: t.level, access: t.access, width: t.width,
        barrier: t.barrier, wheelchair: t.wheelchair, boundaryReferences: e.type === 'node' ? barrierNodes.get(e.id) : undefined } : {}),
      sport: t.sport || '', covered: t.covered || t.shelter_type || '', geometrySource: 'mapped',
      pts: points.flat(), closed: points.length > 3 && points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1],
      crossesBoundary: !points.every((p) => inProperty(site, p)) || undefined };
    (entrance ? site.entrances : site.features).push(record);
  }
  const polygons = cityGeometry?.type === 'Polygon' ? [cityGeometry.coordinates] : cityGeometry?.coordinates || [];
  const cityRings = polygons.map((p) => p.map((r) => r.map(([lon, lat]) => toWorld({ lon, lat })).flat()));
  for (const site of sites.values()) site.inCity = cityRings.some((rings) => inside(rings[0], site.x, site.z, 0) && !rings.slice(1).some((r) => inside(r, site.x, site.z, 0)));
  const result = [...sites.values()].sort((a, b) => a.id.localeCompare(b.id));
  const coverage = {};
  for (const kind of kinds) {
    const selected = result.filter((s) => s.kind === kind), bodies = selected.flatMap((s) => s.bodies);
    coverage[kind] = { regionalSites: selected.length, citySites: selected.filter((s) => s.inCity).length,
      mappedProperties: selected.filter((s) => s.rings.length).length, unknownProperties: selected.filter((s) => !s.rings.length).length,
      sourceIdentities: new Set(selected.flatMap((s) => s.aliases)).size, bodies: bodies.length,
      sitesWithoutBodies: selected.filter((s) => !s.bodies.length).length,
      mappedYardFeatures: selected.reduce((n, s) => n + s.features.filter((f) => ['pitch', 'track', 'playground', 'fitness_station'].includes(f.kind)).length, 0) };
  }
  return { sites: result, bindings, coverage, excluded, issues,
    note: 'Counts describe deduplicated mapped physical sites, not a verified census of school institutions. Generic families/annex roles remain inferred; no unknown property or yard layout is invented.' };
}
