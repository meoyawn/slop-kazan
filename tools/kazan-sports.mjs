import polygonClipping from 'polygon-clipping';

const keyOf = (e) => `${e.osmType || e.type}/${e.id}`;
const venues = new Set(['stadium', 'sports_centre', 'sports_hall', 'ice_rink', 'swimming_pool', 'fitness_centre']);
const grounds = new Set(['pitch', 'track', 'bleachers', 'fitness_station']);
const pointsOf = (r) => Array.from({ length: r.length / 2 }, (_, i) => r.slice(i * 2, i * 2 + 2));
const sportsOf = (t) => [...new Set((t.sport || '').split(';').map((s) => s.trim()).filter(Boolean))];

function inside(ring, x, z) {
  let result = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    if ((ring[i + 1] > z) !== (ring[j + 1] > z) && x < (ring[j] - ring[i]) * (z - ring[i + 1]) / (ring[j + 1] - ring[i + 1]) + ring[i]) result = !result;
  }
  return result;
}

const containsPoint = (p, x, z) => p.rings.some((r) => inside(r, x, z)) && !p.holes.some((r) => inside(r, x, z));

function onBoundary(p, x, z) {
  return [...p.rings, ...p.holes].some((r) => pointsOf(r).some(([ax, az], i, pts) => {
    const [bx, bz] = pts[(i + 1) % pts.length], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(x - ax - t * dx, z - az - t * dz) <= 0.16;
  }));
}

function area(ring) {
  let n = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) n += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(n) / 2;
}

function polygons(p) {
  return p.rings.map((r) => [pointsOf(r), ...p.holes.filter((h) => inside(r, h[0], h[1])).map(pointsOf)]);
}

const polygonArea = (p) => p.reduce((n, rings) => n + area(rings[0]) - rings.slice(1).reduce((v, r) => v + area(r), 0), 0);

function enclosed(property, body) {
  const a = polygons(body), b = polygons(property), size = polygonArea(a);
  return size > 0 && Math.abs(size - polygonArea(polygonClipping.intersection(a, b))) < Math.max(0.02, size * 1e-6);
}

function indexOf(items) {
  const grid = new Map();
  for (const item of items) {
    const pts = item.rings.flatMap(pointsOf);
    if (!pts.length) continue;
    item.bounds = { minX: Math.min(...pts.map((p) => p[0])), maxX: Math.max(...pts.map((p) => p[0])),
      minZ: Math.min(...pts.map((p) => p[1])), maxZ: Math.max(...pts.map((p) => p[1])) };
    for (let x = Math.floor(item.bounds.minX / 256); x <= Math.floor(item.bounds.maxX / 256); x++) {
      for (let z = Math.floor(item.bounds.minZ / 256); z <= Math.floor(item.bounds.maxZ / 256); z++) {
        const key = `${x},${z}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(item);
      }
    }
  }
  return { at: (x, z) => grid.get(`${Math.floor(x / 256)},${Math.floor(z / 256)}`) || [] };
}

function familyOf(t) {
  const sports = sportsOf(t), roofed = t.covered === 'yes' || !!t.building && t.building !== 'no';
  if (t.building === 'grandstand' || t.leisure === 'bleachers') return 'grandstand';
  if (t.leisure === 'fitness_centre') return 'fitness';
  if (t.leisure === 'swimming_pool' || sports.includes('swimming')) return roofed ? 'indoor-pool' : 'pool';
  if (roofed && sports.some((s) => ['basketball', 'ice_hockey', 'ice_skating'].includes(s))) return 'indoor-arena';
  if (t.leisure === 'stadium' && !roofed) return 'open-stadium';
  if (t.leisure === 'ice_rink') return roofed ? 'indoor-arena' : 'open-rink';
  return roofed ? 'sports-hall' : 'sports-site';
}

/** Mapped sports properties own components only when the complete footprint fits outside their holes. */
export function compileSports(source, supplement, helpers, buildings, { education, campuses = [], reviewed = {} } = {}) {
  const { toWorld, closedRing, joinMembers, cityGeometry } = helpers;
  const elements = [...new Map([...source, ...supplement].map((e) => [keyOf(e), e])).values()];
  const byKey = new Map(elements.map((e) => [keyOf(e), e]));
  const parents = buildings.filter((b) => !b.part), bodies = parents.map((b) => ({ reference: keyOf(b), b, rings: [b.ring], holes: b.holes }));
  const bodyIndex = indexOf(bodies), issues = [], shapes = new Map();
  for (const e of elements) {
    const t = e.tags || {};
    if (!venues.has(t.leisure) && !grounds.has(t.leisure) && !['stadium', 'sports_hall', 'sports_centre', 'grandstand'].includes(t.building) && !(t.building && t.sport)) continue;
    if (e.type === 'node') { const [x, z] = toWorld(e); shapes.set(keyOf(e), { x, z, pts: [x, z], rings: [], holes: [] }); continue; }
    if (grounds.has(t.leisure) && e.type === 'way' && e.geometry?.length &&
      (e.geometry[0].lon !== e.geometry.at(-1).lon || e.geometry[0].lat !== e.geometry.at(-1).lat)) {
      const pts = e.geometry.map(toWorld);
      shapes.set(keyOf(e), { x: pts[0][0], z: pts[0][1], pts: pts.flat(), rings: [], holes: [], closed: false }); continue;
    }
    if (e.type === 'relation' && t.type !== 'multipolygon') { issues.push({ reference: keyOf(e), issue: 'non-polygon sports relation retained as source context' }); continue; }
    try {
      const outer = e.type === 'way' ? [closedRing(e.geometry)] : joinMembers(e.members, 'outer').map((r) => closedRing(r));
      const inner = e.type === 'relation' ? joinMembers(e.members, 'inner').map((r) => closedRing(r)) : [];
      const rings = outer.filter((r) => r.length > 2).map((r) => r.flat()), holes = inner.filter((r) => r.length > 2).map((r) => r.flat());
      if (!rings.length) continue;
      const pts = rings.flatMap(pointsOf);
      shapes.set(keyOf(e), { rings, holes, x: pts.reduce((n, p) => n + p[0], 0) / pts.length, z: pts.reduce((n, p) => n + p[1], 0) / pts.length });
    } catch (error) { issues.push({ reference: keyOf(e), issue: error.message }); }
  }
  const properties = elements.filter((e) => shapes.has(keyOf(e)) && !e.tags.building && ['stadium', 'sports_centre'].includes(e.tags.leisure) && shapes.get(keyOf(e)).rings.length)
    .map((e) => ({ reference: keyOf(e), ...shapes.get(keyOf(e)), e }));
  const aliases = new Map();
  for (const p of properties.filter((p) => p.e.type === 'relation')) for (const m of p.e.members) {
    const ref = `${m.type}/${m.ref}`, t = byKey.get(ref)?.tags;
    if (m.type === 'way' && (!m.role || m.role === 'outer') && t?.leisure === p.e.tags.leisure) aliases.set(ref, p.reference);
  }
  const canonical = properties.filter((p) => !aliases.has(p.reference)).sort((a, b) => polygonArea(polygons(a)) - polygonArea(polygons(b)));
  const propertyIndex = indexOf(canonical), siteMap = new Map(), identitySite = new Map();
  for (const e of elements) {
    const reference = keyOf(e), shape = shapes.get(reference), t = e.tags || {};
    if (!shape || grounds.has(t.leisure) || !venues.has(t.leisure) && !['stadium', 'sports_hall', 'sports_centre', 'grandstand'].includes(t.building) && !(t.building && t.sport)) continue;
    const property = canonical.find((p) => p.reference === (aliases.get(reference) || reference)) ||
      propertyIndex.at(shape.x, shape.z).find((p) => shape.rings.length ? enclosed(p, shape) : containsPoint(p, shape.x, shape.z));
    const body = bodyIndex.at(shape.x, shape.z).find((b) => b.reference === reference || !shape.rings.length && containsPoint(b, shape.x, shape.z));
    const owner = property?.reference || body?.reference || reference;
    if (!siteMap.has(owner)) {
      const candidate = byKey.get(body?.reference), bodyTags = candidate?.tags || {};
      const main = property?.e || (venues.has(bodyTags.leisure) || bodyTags.sport || ['stadium', 'sports_centre', 'sports_hall', 'grandstand'].includes(bodyTags.building) ? candidate : e), geometry = property || shape;
      siteMap.set(owner, { id: owner, reference: owner, name: main.tags?.name || t.name || '', family: familyOf(main.tags || t),
        x: geometry.x, z: geometry.z, rings: property?.rings || [], holes: property?.holes || [],
        boundarySource: property ? 'mapped-property' : 'unknown', identities: [], sports: [], bodies: [], features: [], entrances: [],
        appearance: reviewed[owner], classificationSource: 'mapped-tags-and-procedural-family' });
    }
    const site = siteMap.get(owner);
    site.identities.push({ reference, name: t.name || '', kind: t.leisure || t.building, sports: sportsOf(t), covered: t.covered || 'unknown', family: familyOf(t) });
    site.sports = [...new Set([...site.sports, ...sportsOf(t)])];
    identitySite.set(reference, site);
  }
  const bindings = [], siteIndex = indexOf([...siteMap.values()].filter((s) => s.rings.length));
  const educationBodies = new Map((education?.bindings || []).map((b) => [b.reference, b]));
  const contexts = [...(education?.sites || []).filter((s) => s.rings.length).map((s) => ({ ...s, context: s.kind })),
    ...campuses.map((s) => ({ ...s, holes: s.holes || [], context: 'university' }))];
  const contextIndex = indexOf(contexts);
  for (const site of siteMap.values()) {
    site.context = contextIndex.at(site.x, site.z).find((p) => containsPoint(p, site.x, site.z))?.context || 'community';
    site.scale = site.appearance?.scale || (site.identities.some((i) => i.kind === 'stadium') && site.context === 'community' ? 'spectator' : 'community');
  }
  for (const body of bodies) {
    const { b, reference } = body, x = b.ring[0], z = b.ring[1];
    const site = identitySite.get(reference) || siteMap.get(reference) || siteIndex.at(x, z).find((s) => enclosed(s, body));
    if (!site) continue;
    const t = byKey.get(reference)?.tags || {}, observed = reviewed[reference];
    const direct = !!observed?.family || !!identitySite.get(reference) && (venues.has(t.leisure) || !!t.sport || ['sports_centre', 'sports_hall', 'stadium', 'grandstand'].includes(t.building));
    const family = observed?.family || (direct ? familyOf(t) : 'unknown');
    const shared = !direct && ['apartments', 'office', 'commercial', 'residential'].includes(b.kind);
    const binding = { reference, site: site.id, role: shared ? 'shared-envelope' : direct ? 'sports-body' : 'unknown-annex', family,
      context: educationBodies.get(reference) ? education?.sites.find((s) => s.id === educationBodies.get(reference).site)?.kind || site.context : site.context,
      reviewedModel: b.model, appearance: observed || site.appearance };
    bindings.push(binding); site.bodies.push(reference);
  }
  const boundParents = new Map(bindings.map((b) => [b.reference, b]));
  for (const b of buildings.filter((b) => b.part)) {
    const parent = boundParents.get(b.parent);
    if (parent) bindings.push({ ...parent, reference: keyOf(b), parent: b.parent, role: 'mapped-part', reviewedModel: b.model });
  }
  for (const site of siteMap.values()) {
    if (site.family !== 'open-stadium' || site.sports.includes('soccer')) continue;
    if (site.identities.some((i) => i.family === 'indoor-arena') || bindings.some((b) => b.site === site.id && b.reviewedModel === 'tatneft-arena')) {
      site.family = 'indoor-arena'; site.classificationSource = 'mapped-roofed-body-or-reviewed-model';
    }
  }
  const features = [];
  for (const e of elements) {
    const t = e.tags || {}, reference = keyOf(e), shape = shapes.get(reference);
    if (!grounds.has(t.leisure)) continue;
    if (!shape) continue;
    const site = siteIndex.at(shape.x, shape.z).find((s) => shape.rings.length ? enclosed(s, shape) :
      pointsOf(shape.pts || [shape.x, shape.z]).every((p) => containsPoint(s, ...p)));
    const feature = { reference, kind: t.leisure, sports: sportsOf(t), covered: t.covered || 'unknown', ...shape, site: site?.id, geometrySource: 'mapped' };
    features.push(feature); if (site) site.features.push(reference);
  }
  for (const e of elements.filter((e) => e.type === 'node' && e.tags?.entrance)) {
    const [x, z] = toWorld(e), owner = bodyIndex.at(x, z).find((b) => containsPoint(b, x, z) || onBoundary(b, x, z));
    const site = identitySite.get(owner?.reference) || siteMap.get(boundParents.get(owner?.reference)?.site) || siteIndex.at(x, z).find((s) => containsPoint(s, x, z));
    if (site) site.entrances.push({ reference: keyOf(e), x, z, kind: e.tags.entrance, ref: e.tags.ref, wheelchair: e.tags.wheelchair });
  }
  const cityPolys = cityGeometry?.type === 'Polygon' ? [cityGeometry.coordinates] : cityGeometry?.coordinates || [];
  const city = cityPolys.map((p) => ({ rings: [p[0].map(([lon, lat]) => toWorld({ lon, lat })).flat()], holes: p.slice(1).map((r) => r.map(([lon, lat]) => toWorld({ lon, lat })).flat()) }));
  const sites = [...siteMap.values()].sort((a, b) => a.id.localeCompare(b.id));
  for (const s of sites) s.inCity = city.some((p) => containsPoint(p, s.x, s.z));
  return { sites, bindings, features, issues, coverage: { regionalSites: sites.length, citySites: sites.filter((s) => s.inCity).length,
    sourceIdentities: sites.reduce((n, s) => n + s.identities.length, 0), mappedProperties: sites.filter((s) => s.rings.length).length,
    unknownProperties: sites.filter((s) => !s.rings.length).length, bodies: bindings.filter((b) => !b.parent).length,
    parts: bindings.filter((b) => b.parent).length, groundFeatures: features.length, unownedGroundFeatures: features.filter((f) => !f.site).length },
    note: 'Physical mapped sports sites, not an institutional census. Unknown boundaries and annex functions remain unknown; shared commercial/residential fitness envelopes retain their ordinary facade. Family assignments are procedural inferences.' };
}
