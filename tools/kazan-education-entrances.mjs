import polygonClipping from 'polygon-clipping';

const referenceOf = (body) => `${body.osmType}/${body.id}`;
const pointsOf = (ring) => Array.from({ length: ring.length / 2 }, (_, i) => ring.slice(i * 2, i * 2 + 2));
const quantize = (value) => Math.round(value * 1000) / 1000;

function inside(ring, x, z) {
  let result = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    if ((ring[i + 1] > z) !== (ring[j + 1] > z) && x < (ring[j] - ring[i]) * (z - ring[i + 1]) / (ring[j + 1] - ring[i + 1]) + ring[i]) result = !result;
  }
  return result;
}

const inBody = (body, x, z) => inside(body.ring, x, z) && !(body.holes || []).some((r) => inside(r, x, z));

function polygonArea(polygons) {
  let total = 0;
  for (const polygon of polygons) for (const [index, ring] of polygon.entries()) {
    let value = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) value += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    total += Math.abs(value) / 2 * (index ? -1 : 1);
  }
  return total;
}

function porchFootprint(frame, depth) {
  return [[-frame.porchWidth / 2, 0.12], [frame.porchWidth / 2, 0.12],
    [frame.porchWidth / 2, depth], [-frame.porchWidth / 2, depth]]
    .map(([u, v]) => [frame.x + frame.ux * u + frame.nx * v, frame.z + frame.uz * u + frame.nz * v]);
}

/** Mapped door points select actual owned walls; shallow ground-following porches stay in clear, established space. */
export function compileEducationEntrances(education, buildings, { kind = 'school' } = {}) {
  const selected = education.sites.filter((s) => s.kind === kind), siteIds = new Set(selected.map((s) => s.id));
  const ownedReferences = new Set([...selected.flatMap((s) => s.bodies.map((b) => b.reference)),
    ...education.bindings.filter((b) => siteIds.has(b.site)).map((b) => b.reference)]);
  const canopies = [];
  for (const [buildingIndex, body] of buildings.entries()) {
    if (!ownedReferences.has(referenceOf(body)) || body.kind !== 'roof' || body.part || body.hasParts || body.model || body.construction) continue;
    const sourceMinHeight = body.minHeight || 0;
    if (!sourceMinHeight) body.minHeight = quantize(Math.max(0, body.h - 0.22));
    canopies.push({ body: referenceOf(body), buildingIndex, sourceMinHeight,
      undersideSource: sourceMinHeight ? 'mapped-minimum-height' : 'procedural-roof-thickness-estimate' });
  }
  const indices = new Map(), owners = new Map(), groundCells = new Map();
  for (const [index, body] of buildings.entries()) {
    const reference = referenceOf(body);
    if (!indices.has(reference)) indices.set(reference, []);
    indices.get(reference).push(index);
    if ((body.minHeight || 0) > 0.5) continue;
    const xs = body.ring.filter((_, i) => !(i % 2)), zs = body.ring.filter((_, i) => i % 2);
    for (let x = Math.floor(Math.min(...xs) / 64); x <= Math.floor(Math.max(...xs) / 64); x++) {
      for (let z = Math.floor(Math.min(...zs) / 64); z <= Math.floor(Math.max(...zs) / 64); z++) {
        const key = `${x},${z}`;
        if (!groundCells.has(key)) groundCells.set(key, []);
        groundCells.get(key).push(index);
      }
    }
  }
  for (const binding of education.bindings) {
    if (!owners.has(binding.site)) owners.set(binding.site, new Set());
    owners.get(binding.site).add(binding.reference);
  }
  const entries = [], gates = [], unresolved = [], seen = new Set();
  for (const site of selected) {
    const references = new Set([...(owners.get(site.id) || []), ...site.bodies.map((b) => b.reference)]);
    const candidates = [...references].flatMap((ref) => indices.get(ref) || []);
    for (const source of site.entrances) {
      if (seen.has(source.reference)) continue;
      seen.add(source.reference);
      function skip(reason) { unresolved.push({ site: site.id, entrance: source.reference, reason }); }
      function gate() { gates.push({ id: source.reference, site: site.id, pts: source.pts, boundaryReferences: source.boundaryReferences,
        geometrySource: source.barrier ? 'mapped-gate' : 'mapped-entrance-on-barrier' }); }
      if (source.pts.length !== 2) { skip('non-point-entrance'); continue; }
      if (/gate/.test(source.barrier || '')) { gate(); continue; }
      const levels = source.level == null ? [] : String(source.level).split(';').map(Number);
      if (levels?.length && !levels.includes(0)) { skip('non-ground-level'); continue; }
      const [x, z] = source.pts;
      let best;
      for (const index of candidates) {
        const body = buildings[index];
        for (const ring of [body.ring, ...(body.holes || [])]) for (let i = 0; i < ring.length; i += 2) {
          const j = (i + 2) % ring.length, dx = ring[j] - ring[i], dz = ring[j + 1] - ring[i + 1], length = Math.hypot(dx, dz);
          if (length < 1.1) continue;
          const requested = Number.parseFloat(source.width) || (/service|emergency|staircase/.test(source.entranceType || '') ? 1 : 1.8);
          const width = Math.min(Math.max(0.8, requested), 3.5, length - 0.4), porchWidth = Math.min(width + 0.8, length - 0.2);
          const margin = porchWidth / 2 + 0.05;
          const along = Math.max(margin, Math.min(length - margin, ((x - ring[i]) * dx + (z - ring[i + 1]) * dz) / length));
          const px = ring[i] + dx * along / length, pz = ring[i + 1] + dz * along / length, distance = Math.hypot(x - px, z - pz);
          if (distance > 1.5) continue;
          const ux = dx / length, uz = dz / length;
          let nx = -uz, nz = ux;
          if (inBody(body, px + nx * 0.2, pz + nz * 0.2)) { nx = -nx; nz = -nz; }
          const rank = distance + (body.part && !body.minHeight ? 0 : 0.01);
          if (!best || rank < best.rank) best = { rank, distance, buildingIndex: index, x: px, z: pz, ux, uz, nx, nz, width, porchWidth };
        }
      }
      if (!best) { if (source.boundaryReferences?.length) gate(); else skip('no-nearby-owned-wall'); continue; }
      const body = buildings[best.buildingIndex];
      if (body.model) { skip('existing-model-envelope'); continue; }
      if (body.kind === 'roof') { skip('roof-without-door-wall'); continue; }
      const shared = /^(apartments|residential|office|dormitory|commercial)$/.test(body.kind);
      const wallHeight = body.h - (body.minHeight || 0);
      if (body.minHeight > 0.5 || wallHeight < 1.85) { skip('no-ground-floor-envelope'); continue; }
      if (body.construction && body.construction.stage !== 'renovation') { skip('unfinished-building'); continue; }
      let approach, approachStatus = 'door-only';
      const bounds = { minX: best.x - 5, maxX: best.x + 5, minZ: best.z - 5, maxZ: best.z + 5 };
      const nearbyIndices = new Set();
      for (let x = Math.floor(bounds.minX / 64); x <= Math.floor(bounds.maxX / 64); x++) {
        for (let z = Math.floor(bounds.minZ / 64); z <= Math.floor(bounds.maxZ / 64); z++) {
          for (const index of groundCells.get(`${x},${z}`) || []) nearbyIndices.add(index);
        }
      }
      const nearby = [...nearbyIndices].map((index) => buildings[index]);
      if (!nearby.includes(body)) nearby.push(body);
      for (const depth of shared ? [] : site.rings.length ? [1.4, 0.7, 0.35] : [0.7, 0.35]) {
        const rectangle = porchFootprint(best, depth);
        try {
          if (site.rings.length && polygonArea(polygonClipping.difference([rectangle], site.rings.map((r) => [pointsOf(r),
            ...(site.holes || []).filter((h) => inside(r, h[0], h[1])).map(pointsOf)]))) > 0.005) continue;
          if (nearby.some((b) => polygonArea(polygonClipping.intersection([rectangle], [pointsOf(b.ring), ...(b.holes || []).map(pointsOf)])) > 0.005)) continue;
          approach = rectangle.flat().map(quantize); approachStatus = site.rings.length ? 'property-clear-space-fit' : 'shallow-unknown-property-estimate'; break;
        } catch { approachStatus = 'uncertain-source-geometry'; }
      }
      entries.push({ id: source.reference, site: site.id, inCity: site.inCity, body: referenceOf(body), buildingIndex: best.buildingIndex,
        x: quantize(best.x), z: quantize(best.z), ux: best.ux, uz: best.uz, nx: best.nx, nz: best.nz,
        width: quantize(best.width), height: quantize(Math.min(2.25, wallHeight - 0.2)), porchWidth: quantize(best.porchWidth),
        approach, approachStatus: shared ? 'shared-door-only' : approachStatus, sharedEnvelope: shared,
        canopy: !shared && wallHeight >= 2.9 && source.covered !== 'no' && !/service|emergency/.test(source.entranceType || '') &&
          !canopies.some((c) => inBody(buildings[c.buildingIndex], best.x + best.nx * 0.5, best.z + best.nz * 0.5)),
        sourcePoint: source.pts, projectionDistance: quantize(best.distance), entranceType: source.entranceType || 'yes',
        covered: source.covered, access: source.access, wheelchair: source.wheelchair,
        geometrySource: 'mapped-entrance-wall-fit', dimensionsSource: 'procedural-estimate', source: `https://www.openstreetmap.org/${source.reference}` });
    }
  }
  return { entries, gates, unresolved, canopies, coverage: { mappedEntrances: seen.size, renderedEntrances: entries.length, siteGates: gates.length,
    sitesWithEntrances: new Set(entries.map((e) => e.site)).size, cityEntrances: entries.filter((e) => e.inCity).length,
    porches: entries.filter((e) => e.approach).length, mappedCanopies: canopies.length } };
}
