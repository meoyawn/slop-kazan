import { resolveFuelBrand } from '../js/kazan-fuel-brands.js';

const identity = (e) => `${e.type || e.osmType}/${e.id}`;
const flat = (points) => points.flat();
const q = (v) => Math.round(v * 10) / 10;

function inside(ring, x, z) {
  let hit = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    if ((ring[i + 1] > z) !== (ring[j + 1] > z) && x < (ring[j] - ring[i]) * (z - ring[i + 1]) / (ring[j + 1] - ring[i + 1]) + ring[i]) hit = !hit;
  }
  return hit;
}

function frame(ring) {
  let best;
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length, dx = ring[j] - ring[i], dz = ring[j + 1] - ring[i + 1], length = Math.hypot(dx, dz);
    if (!length) continue;
    let ux = dx / length, uz = dz / length;
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (let k = 0; k < ring.length; k += 2) {
      const u = ring[k] * ux + ring[k + 1] * uz, v = -ring[k] * uz + ring[k + 1] * ux;
      a = Math.min(a, u); b = Math.max(b, u); c = Math.min(c, v); d = Math.max(d, v);
    }
    if (best && best.area <= (b - a) * (d - c) + 0.01) continue;
    const x = (a + b) / 2 * ux - (c + d) / 2 * uz, z = (a + b) / 2 * uz + (c + d) / 2 * ux;
    let w = b - a, depth = d - c;
    if (depth > w) { [ux, uz] = [-uz, ux]; [w, depth] = [depth, w]; }
    best = { x: q(x), z: q(z), ux, uz, w: q(w), d: q(depth), area: (b - a) * (d - c) };
  }
  return best;
}

function pointAt(f, u, v) { return [q(f.x + f.ux * u - f.uz * v), q(f.z + f.uz * u + f.ux * v)]; }

function rectangle(f) { return flat([pointAt(f, -f.w / 2, -f.d / 2), pointAt(f, f.w / 2, -f.d / 2), pointAt(f, f.w / 2, f.d / 2), pointAt(f, -f.w / 2, f.d / 2)]); }

function compatible(a, b) {
  if (a.tags.ref && b.tags.ref && a.tags.ref !== b.tags.ref) return false;
  if (a.brand.family !== 'neutral' && b.brand.family !== 'neutral') return a.brand.family === b.brand.family;
  if (a.tags.brand && b.tags.brand) return a.tags.brand.toLowerCase() === b.tags.brand.toLowerCase();
  return true;
}

/** Compile sites, retaining evidence for containment, branded aliases and estimated layouts. */
export function compileFuelStations(elements, { toWorld, closedRing, insideBounds }, buildings, roads) {
  const features = [], sourceById = new Map(elements.map((e) => [identity(e), e]));
  for (const e of elements) {
    if (e.tags?.amenity !== 'fuel') continue;
    const ring = e.geometry ? flat(closedRing(e.geometry, undefined, 0)) : null;
    if (e.type !== 'node' && (!ring || ring.length < 6)) continue;
    const f = ring ? frame(ring) : null, [x, z] = f ? [f.x, f.z] : toWorld(e);
    if (!insideBounds([x, z])) continue;
    features.push({ id: identity(e), references: [identity(e)], x, z, ring, frame: f, tags: e.tags, brand: resolveFuelBrand(e.tags), canopies: [], shops: [], pumps: [], unresolved: [] });
  }
  const areas = features.filter((s) => s.ring).sort((a, b) => a.frame.area - b.frame.area), merged = new Set();
  for (const s of features.filter((s) => !s.ring)) {
    const area = areas.find((a) => inside(a.ring, s.x, s.z) && compatible(a, s));
    if (!area) continue;
    area.references.push(s.id); area.tags = { ...s.tags, ...area.tags }; area.brand = resolveFuelBrand(area.tags); merged.add(s);
  }
  const stations = features.filter((s) => !merged.has(s)), bindings = [], fuelBuildings = new Set(features.flatMap((s) => s.references));
  function owner(x, z, maxDistance = 48) {
    let best = null, distance = maxDistance;
    for (const s of stations) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (s.ring && inside(s.ring, x, z)) return { station: s, evidence: 'mapped-containment' };
      if (d < distance) { best = s; distance = d; }
    }
    return best ? { station: best, evidence: 'nearest-site-estimate' } : null;
  }
  for (const b of buildings) {
    if (b.part || b.model || b.construction) continue;
    const tags = sourceById.get(identity(b))?.tags || {};
    if (!['roof', 'retail', 'kiosk'].includes(b.kind) && tags.shop !== 'convenience' && !fuelBuildings.has(identity(b))) continue;
    const f = frame(b.ring), matched = owner(f.x, f.z);
    if (!matched) continue;
    const s = matched.station;
    if (b.kind === 'roof' && f.area > 12 && f.area < 3500) {
      s.canopies.push({ id: identity(b), ring: b.ring, holes: b.holes, ...f, clearance: Math.max(4.5, Number.parseFloat(tags.min_height) || 5), dimensionSource: 'mapped-footprint', clearanceSource: tags.min_height ? 'osm-min-height' : 'procedural-estimate', association: matched.evidence });
      bindings.push({ id: identity(b), station: s.id, role: 'canopy' });
    } else if ((s.references.includes(identity(b)) || ['retail', 'kiosk'].includes(b.kind) || tags.shop === 'convenience') && f.area < 1100) {
      s.shops.push({ id: identity(b), ...f, association: matched.evidence });
      bindings.push({ id: identity(b), station: s.id, role: 'shop' });
    }
  }
  const unassignedPumps = [];
  for (const e of elements) {
    if (e.tags?.man_made !== 'fuel_pump') continue;
    const [x, z] = toWorld(e), matched = owner(x, z, 60);
    if (!insideBounds([x, z])) continue;
    if (matched) matched.station.pumps.push({ id: identity(e), x, z, source: 'mapped-point', association: matched.evidence });
    else unassignedPumps.push({ id: identity(e), x, z, source: 'mapped-point', tags: e.tags, unresolved: 'Parent station identity/extent unresolved.' });
  }
  for (const s of stations) {
    s.status = s.tags.disused === 'yes' ? 'disused' : s.tags.access === 'private' ? 'private' : 'mapped';
    s.fuels = Object.entries(s.tags).filter(([k, v]) => k.startsWith('fuel:') && v === 'yes').map(([k]) => k.slice(5));
    if (!s.canopies.length) {
      const gasOnly = s.fuels.length && s.fuels.every((f) => ['lpg', 'cng', 'lng', 'biogas'].includes(f));
      const f = { x: s.x, z: s.z, ux: 1, uz: 0, w: gasOnly ? 8 : 20, d: gasOnly ? 6 : 12 };
      let distance = 70;
      for (const r of roads) {
        if (!r.service) continue;
        for (let i = 2; i < r.pts.length; i += 2) {
          const dx = r.pts[i] - r.pts[i - 2], dz = r.pts[i + 1] - r.pts[i - 1], length = Math.hypot(dx, dz);
          if (!length) continue;
          const t = Math.max(0, Math.min(1, ((s.x - r.pts[i - 2]) * dx + (s.z - r.pts[i - 1]) * dz) / length ** 2));
          const d = Math.hypot(s.x - r.pts[i - 2] - t * dx, s.z - r.pts[i - 1] - t * dz);
          if (d < distance) { distance = d; f.ux = -dz / length; f.uz = dx / length; }
        }
      }
      if (s.ring) { f.x = s.frame.x; f.z = s.frame.z; f.ux = s.frame.ux; f.uz = s.frame.uz; f.w = Math.min(f.w, s.frame.w * 0.7); f.d = Math.min(f.d, s.frame.d * 0.6); }
      const enclosingShop = s.shops.find((b) => Math.abs((f.x - b.x) * b.ux + (f.z - b.z) * b.uz) < b.w / 2 && Math.abs(-(f.x - b.x) * b.uz + (f.z - b.z) * b.ux) < b.d / 2);
      if (enclosingShop) {
        f.x = q(enclosingShop.x - enclosingShop.uz * (enclosingShop.d / 2 + f.d / 2 + 4));
        f.z = q(enclosingShop.z + enclosingShop.ux * (enclosingShop.d / 2 + f.d / 2 + 4));
      }
      s.canopies.push({ id: `${s.id}/estimated-canopy`, ...f, ring: rectangle(f), holes: [], clearance: 5, dimensionSource: 'procedural-estimate', clearanceSource: 'procedural-estimate' });
      s.unresolved.push('Canopy footprint/layout estimated; check aerial or site photograph.');
    }
    for (const c of s.canopies) {
      c.pumps = s.pumps.filter((p) => inside(c.ring, p.x, p.z));
      if (c.pumps.length >= 2) {
        let span = 0;
        for (const a of c.pumps) for (const b of c.pumps) {
          const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
          if (length > span) { span = length; c.pumpAxis = { ux: dx / length, uz: dz / length }; }
        }
        continue;
      }
      const columns = Math.max(1, Math.min(10, Math.round(c.w / 7))), rows = Math.max(1, Math.min(4, Math.floor(c.d / 13)));
      for (let u = 0; u < columns; u++) for (let v = 0; v < rows; v++) {
        const [x, z] = pointAt(c, (u - (columns - 1) / 2) * c.w / columns, (v - (rows - 1) / 2) * c.d / rows);
        if (inside(c.ring, x, z) && !c.holes.some((h) => inside(h, x, z)) && !s.pumps.some((p) => Math.hypot(p.x - x, p.z - z) < 6)) c.pumps.push({ id: `${c.id}/pump-${u}-${v}`, x, z, source: 'procedural-estimate' });
      }
    }
    s.pumps = s.pumps.concat(s.canopies.flatMap((c) => c.pumps.filter((p) => p.source !== 'mapped-point')));
    s.unresolved.push('Network livery is a shared photo family; individual elevations, exact post positions and hidden grounds unverified.');
    delete s.frame;
  }
  return { stations, bindings, unassignedPumps, sourceFeatures: features.length, mergedFeatures: merged.size, mappedPumps: stations.reduce((n, s) => n + s.pumps.filter((p) => p.source === 'mapped-point').length, unassignedPumps.length) };
}
