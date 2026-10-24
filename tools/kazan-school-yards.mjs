const pointsOf = (ring) => Array.from({ length: ring.length / 2 }, (_, i) => ring.slice(i * 2, i * 2 + 2));

function inside(ring, x, z) {
  let value = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) value = !value;
  }
  return value;
}

function area(ring) {
  let value = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i++) value += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(value) / 2;
}

function bufferLine(a, b, radius) {
  const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
  if (length < 0.01) return null;
  const nx = -dz * radius / length, nz = dx * radius / length;
  return [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]];
}

function bufferedRing(ring, margin) {
  const result = [[ring]];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], strip = bufferLine(a, b, margin);
    if (strip) result.push([strip]);
    result.push([Array.from({ length: 8 }, (_, j) => [a[0] + Math.cos(j * Math.PI / 4) * margin, a[1] + Math.sin(j * Math.PI / 4) * margin])]);
  }
  return result;
}

function crossesCell(a, b, x0, z0, x1, z1) {
  let low = 0, high = 1;
  for (const [value, delta, min, max] of [[a[0], b[0] - a[0], x0, x1], [a[1], b[1] - a[1], z0, z1]]) {
    if (!delta) { if (value < min || value > max) return false; continue; }
    const t = (min - value) / delta, u = (max - value) / delta;
    low = Math.max(low, Math.min(t, u)); high = Math.min(high, Math.max(t, u));
    if (low > high) return false;
  }
  return true;
}

/** Free-space geometry alone determines the layout; every obstacle and circulation corridor stays reserved. */
export function layoutSchoolYard({ rings, holes = [], buildings = [], paths = [], mapped = [], reserved = [], anchorRing }) {
  if (!rings.length) return { activities: [], status: 'missing-property' };
  const territory = rings.map(pointsOf), inner = holes.map(pointsOf), all = territory.flat();
  const cx = (Math.min(...all.map((p) => p[0])) + Math.max(...all.map((p) => p[0]))) / 2;
  const cz = (Math.min(...all.map((p) => p[1])) + Math.max(...all.map((p) => p[1]))) / 2;
  const anchor = buildings.slice().sort((a, b) => area(pointsOf(b.ring)) - area(pointsOf(a.ring)) ||
    Math.min(...a.ring.filter((_, i) => !(i % 2))) - Math.min(...b.ring.filter((_, i) => !(i % 2))))[0];
  let longest = 0, ux = 1, uz = 0;
  const axis = anchorRing ? pointsOf(anchorRing) : anchor ? pointsOf(anchor.ring) : territory[0];
  for (let i = 0; i < axis.length; i++) {
    const a = axis[i], b = axis[(i + 1) % axis.length], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length > longest) { longest = length; ux = (b[0] - a[0]) / length; uz = (b[1] - a[1]) / length; }
  }
  if (ux < 0 || !ux && uz < 0) { ux = -ux; uz = -uz; }
  function local([x, z]) {
    return [(x - cx) * ux + (z - cz) * uz, -(x - cx) * uz + (z - cz) * ux];
  }
  function world([u, v]) {
    return [Math.round((cx + u * ux - v * uz) * 100) / 100, Math.round((cz + u * uz + v * ux) * 100) / 100];
  }
  const outer = territory.map((r) => r.map(local)), voids = inner.map((r) => r.map(local));
  const property = outer.map((r) => [r, ...voids.filter((h) => inside(r, ...h[0]))]);
  const obstacles = [];
  for (const b of buildings) {
    const ring = pointsOf(b.ring).map(local), bHoles = (b.holes || []).map((r) => pointsOf(r).map(local));
    obstacles.push([ring, ...bHoles]);
    for (const boundary of [ring, ...bHoles]) obstacles.push(...bufferedRing(boundary, 2.5).slice(1));
  }
  for (const path of paths) {
    const points = pointsOf(path.pts).map(local), radius = (path.width || 2.5) / 2 + 1.2;
    for (let i = 1; i < points.length; i++) { const strip = bufferLine(points[i - 1], points[i], radius); if (strip) obstacles.push([strip]); }
  }
  for (const item of mapped) {
    const buffered = bufferedRing(pointsOf(item.ring).map(local), 2);
    obstacles.push(...(item.kind === 'track' ? buffered.slice(1) : buffered));
  }
  for (const item of reserved) obstacles.push([pointsOf(item.ring).map(local), ...(item.holes || []).map((r) => pointsOf(r).map(local))]);
  const coordinates = property.flat(2), x0 = Math.floor(Math.min(...coordinates.map((p) => p[0])) / 2) * 2;
  const z0 = Math.floor(Math.min(...coordinates.map((p) => p[1])) / 2) * 2;
  const maxX = Math.max(...coordinates.map((p) => p[0])), maxZ = Math.max(...coordinates.map((p) => p[1]));
  const step = (maxX - x0) * (maxZ - z0) > 480000 ? 4 : 2;
  const cols = Math.ceil((maxX - x0) / step), rows = Math.ceil((maxZ - z0) / step), blocked = new Uint8Array(cols * rows);
  for (const polygon of [...property, ...obstacles]) for (const ring of polygon) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const left = Math.max(0, Math.floor((Math.min(a[0], b[0]) - x0 - 0.01) / step));
    const right = Math.min(cols - 1, Math.floor((Math.max(a[0], b[0]) - x0 + 0.01) / step));
    const low = Math.max(0, Math.floor((Math.min(a[1], b[1]) - z0 - 0.01) / step));
    const high = Math.min(rows - 1, Math.floor((Math.max(a[1], b[1]) - z0 + 0.01) / step));
    for (let row = low; row <= high; row++) for (let col = left; col <= right; col++) {
      if (crossesCell(a, b, x0 + col * step - 0.01, z0 + row * step - 0.01, x0 + (col + 1) * step + 0.01, z0 + (row + 1) * step + 0.01)) blocked[row * cols + col] = 1;
    }
  }
  const obstacleCells = new Map();
  for (const polygon of obstacles) {
    const points = polygon.flat(), xs = points.map((p) => p[0]), zs = points.map((p) => p[1]);
    const minX = Math.max(x0, Math.min(...xs)), highX = Math.min(maxX, Math.max(...xs));
    const minZ = Math.max(z0, Math.min(...zs)), highZ = Math.min(maxZ, Math.max(...zs));
    for (let x = Math.floor(minX / 16); x <= Math.floor(highX / 16); x++) for (let z = Math.floor(minZ / 16); z <= Math.floor(highZ / 16); z++) {
      const key = `${x},${z}`;
      if (!obstacleCells.has(key)) obstacleCells.set(key, []);
      obstacleCells.get(key).push(polygon);
    }
  }
  function inPolygon(polygon, x, z) {
    return inside(polygon[0], x, z) && !polygon.slice(1).some((r) => inside(r, x, z));
  }
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    if (blocked[row * cols + col]) continue;
    const x = x0 + (col + 0.5) * step, z = z0 + (row + 0.5) * step;
    if (!property.some((p) => inPolygon(p, x, z)) ||
      (obstacleCells.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`) || []).some((p) => inPolygon(p, x, z))) blocked[row * cols + col] = 1;
  }
  function fit(width, depth) {
    const needX = Math.ceil((width + 4) / step), needZ = Math.ceil((depth + 4) / step), heights = new Uint16Array(cols);
    let best;
    for (let row = 0; row < rows; row++) {
      const stack = [];
      for (let col = 0; col <= cols; col++) {
        if (col < cols) heights[col] = blocked[row * cols + col] ? 0 : heights[col] + 1;
        const height = col === cols ? 0 : heights[col];
        let start = col;
        while (stack.length && stack.at(-1).height > height) {
          const item = stack.pop(), available = col - item.start;
          if (item.height >= needZ && available >= needX) {
            const candidate = { col: item.start, row: row - item.height + 1, w: needX, d: needZ, waste: available * item.height - needX * needZ };
            if (!best || candidate.waste < best.waste || candidate.waste === best.waste &&
              (candidate.row < best.row || candidate.row === best.row && candidate.col < best.col)) best = candidate;
          }
          start = item.start;
        }
        if (!stack.length || stack.at(-1).height < height) stack.push({ start, height });
      }
    }
    return best;
  }
  const activities = [];
  for (const [kind, variants] of [['football', [[52, 32], [42, 24], [30, 18]]], ['hockey', [[40, 20], [28, 15]]],
    ['basketball', [[26, 14], [20, 12]]], ['exercise', [[8, 6], [6, 4]]]]) {
    if (mapped.some((m) => m.kind === kind)) continue;
    let chosen;
    for (const [w, d] of variants) {
      for (const rotated of [false, true]) {
        const width = rotated ? d : w, depth = rotated ? w : d, rectangle = fit(width, depth);
        if (rectangle) { chosen = { ...rectangle, width, depth }; break; }
      }
      if (chosen) break;
    }
    if (!chosen) continue;
    const { col, row, w, d, width, depth } = chosen, left = x0 + col * step + 2, low = z0 + row * step + 2;
    const ring = [[left, low], [left + width, low], [left + width, low + depth], [left, low + depth]].map(world).flat();
    activities.push({ kind, ring, geometrySource: 'free-space-fit-estimate' });
    for (let r = row; r < row + d; r++) for (let c = col; c < col + w; c++) blocked[r * cols + c] = 1;
  }
  return { activities, status: activities.length || mapped.length ? 'fitted' : 'insufficient-free-space' };
}

function boundsOf(ring) {
  const xs = ring.filter((_, i) => !(i % 2)), zs = ring.filter((_, i) => i % 2);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

const overlaps = (a, b) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

/** All schools use the same spatial fit; source enclosures can recover an otherwise unknown yard boundary. */
export function compileSchoolYards(education, buildings, roads, recreation, helpers) {
  const { enclosures = [], reserved = [], yardFeatures = [] } = helpers;
  const bodies = buildings.filter((b) => !b.part).map((b) => ({ b, bounds: boundsOf(b.ring) }));
  const routes = roads.filter((r) => !r.bridge && !r.tunnel && !r.layer).map((r) => ({ r, bounds: boundsOf(r.pts) }));
  const childcare = education.sites.filter((s) => s.kind === 'kindergarten' && s.boundaryKind === 'kindergarten')
    .flatMap((s) => s.rings.map((ring) => ({ ring, holes: s.holes })));
  const reservations = [...reserved, ...childcare].map((r) => ({ ...r, bounds: boundsOf(r.ring) }));
  const byBody = new Map(buildings.map((b) => [`${b.osmType}/${b.id}`, b])), yards = [], unresolved = [], seen = new Map();
  for (const site of education.sites.filter((s) => s.kind === 'school')) {
    let rings = site.rings, holes = site.holes, reference = site.reference, boundarySource = site.boundarySource;
    let boundaryReferences = [site.reference];
    if (!rings.length) {
      const main = site.bodies.filter((b) => b.role === 'teaching').map((b) => byBody.get(b.reference)).filter(Boolean)
        .sort((a, b) => area(pointsOf(b.ring)) - area(pointsOf(a.ring)))[0];
      if (main) {
        const bArea = area(pointsOf(main.ring));
        const fence = enclosures.filter((e) => {
          const ring = pointsOf(e.ring), size = area(ring);
          return size > bArea * 1.3 && size < Math.max(50000, bArea * 20) && pointsOf(main.ring).every((p) => inside(ring, ...p)) &&
            !education.sites.some((s) => s.kind === 'kindergarten' && inside(ring, s.x, s.z));
        }).sort((a, b) => area(pointsOf(a.ring)) - area(pointsOf(b.ring)))[0];
        if (fence) {
          rings = [fence.ring]; holes = []; reference = fence.reference; boundaryReferences = fence.references;
          boundarySource = 'mapped-enclosure-inferred-school';
        }
      }
    }
    if (!rings.length) { unresolved.push({ site: site.id, reason: 'missing-property-or-enclosure' }); continue; }
    if (seen.has(reference)) { seen.get(reference).schools.push(site.id); continue; }
    const bounds = boundsOf(rings.flat());
    const localBodies = bodies.filter((v) => overlaps(v.bounds, bounds)).map((v) => v.b);
    const main = site.bodies.filter((b) => b.role === 'teaching').map((b) => byBody.get(b.reference)).filter(Boolean).sort((a, b) => area(pointsOf(b.ring)) - area(pointsOf(a.ring)))[0];
    const localPaths = routes.filter((v) => overlaps(v.bounds, bounds)).map((v) => ({ pts: v.r.pts, width: v.r.w }));
    for (const entry of education.schoolEntrances?.entries || []) if (entry.site === site.id) {
      localPaths.push({ pts: [entry.x, entry.z, entry.x + entry.nx * 2, entry.z + entry.nz * 2], width: entry.porchWidth });
    }
    const mapped = [];
    const features = boundarySource === 'mapped-enclosure-inferred-school' ? yardFeatures.filter((f) => pointsOf(f.pts)
      .every((p) => rings.some((r) => inside(pointsOf(r), ...p)) && !holes.some((r) => inside(pointsOf(r), ...p)))) : site.features;
    for (const feature of features) if (['fence', 'wall', 'hedge'].includes(feature.kind) && feature.pts.length >= 4) {
      localPaths.push({ pts: feature.pts, width: 0.3 });
    }
    for (const f of features) {
      if (!f.closed || f.crossesBoundary || !['pitch', 'fitness_station', 'playground', 'track'].includes(f.kind)) continue;
      const sport = f.sport.split(';'), kind = sport.some((s) => /hockey/.test(s)) ? 'hockey' :
        sport.some((s) => /soccer|futsal/.test(s)) ? 'football' : sport.includes('basketball') ? 'basketball' :
          f.kind === 'fitness_station' ? 'exercise' : f.kind === 'track' ? 'track' : f.kind === 'playground' ? 'playground' : 'court';
      const ring = f.pts.slice(0, -2);
      if (ring.length >= 6) mapped.push({ kind, ring, reference: f.reference, geometrySource: 'mapped' });
    }
    const result = layoutSchoolYard({ rings, holes, buildings: localBodies, paths: localPaths, mapped, anchorRing: main?.ring,
      reserved: reservations.filter((r) => overlaps(r.bounds, bounds)) });
    const yard = { id: reference, schools: [site.id], inCity: site.inCity, rings, holes, boundarySource, boundaryReferences, status: result.status,
      activities: [...mapped, ...result.activities], layoutSource: 'territory-buildings-and-access-geometry', source: site.source };
    seen.set(reference, yard); yards.push(yard);
    if (!yard.activities.length) unresolved.push({ site: site.id, reason: result.status });
    for (const [index, activity] of yard.activities.entries()) {
      const existing = activity.reference && recreation.find((r) => `${r.osmType}/${r.id}` === activity.reference);
      if (existing?.site) continue;
      if (existing) { existing.site = 'school'; existing.kind = activity.kind; existing.schoolYard = yard.id; }
      else recreation.push({ id: `${yard.id}/${activity.kind}/${index}`, site: 'school', kind: activity.kind,
        schoolYard: yard.id, ring: activity.ring, geometrySource: activity.geometrySource });
    }
  }
  const covered = new Set(yards.filter((y) => y.activities.length).flatMap((y) => y.schools));
  return { yards, unresolved, coverage: { totalSchools: education.coverage.school.regionalSites,
    schoolsWithActivities: covered.size, citySchoolsWithActivities: education.sites.filter((s) => s.inCity && covered.has(s.id)).length,
    propertiesWithLayouts: yards.length, mappedActivities: yards.flatMap((y) => y.activities).filter((a) => a.geometrySource === 'mapped').length,
    generatedActivities: yards.flatMap((y) => y.activities).filter((a) => a.geometrySource !== 'mapped').length } };
}
