(function () {
const { GEO, THREE, terrainHeight, groundSurfaceHeight, toPoints } = NYC;
/** Independent path samplers share geometry rules without sharing heavy-rail and tram junction identities. */
function createRailwayPaths(data) {
const tracks = data.tracks.map((t) => ({ ...t, pts: toPoints(t.pts), distances: [0], length: 0 }));
const offsets = new Map(), incident = new Map(), anchors = new Set(), corrections = new Map();
for (const t of tracks) {
  for (let i = 1; i < t.pts.length; i++) {
    t.length += Math.hypot(t.pts[i].x - t.pts[i - 1].x, t.pts[i].z - t.pts[i - 1].z);
    t.distances.push(t.length);
  }
}
for (const link of data.graph.links) for (const node of [link.a, link.b]) {
  if (!incident.has(node)) incident.set(node, []);
  incident.get(node).push(link);
}
const pending = [];
for (const t of tracks) {
  if (!t.bridge && !t.tunnel && !t.layer) continue;
  const first = t.pts[0], last = t.pts.at(-1), ya = groundSurfaceHeight(first.x, first.z), yb = groundSurfaceHeight(last.x, last.z);
  for (let i = 0; i < t.nodes.length; i++) {
    const node = t.nodes[i], p = t.pts[i], ground = groundSurfaceHeight(p.x, p.z), u = t.distances[i] / (t.length || 1);
    anchors.add(node);
    const level = t.tunnel || t.layer < 0 ? -6 * Math.max(1, Math.abs(t.layer)) :
      Math.max(6 * Math.max(1, t.layer), ya * (1 - u) + yb * u + 5 - ground);
    if (Math.abs(level) > Math.abs(offsets.get(node) || 0)) { offsets.set(node, level); pending.push(node); }
  }
}
for (let i = 0; i < pending.length; i++) {
  const node = pending[i], offset = offsets.get(node);
  for (const link of incident.get(node) || []) {
    const next = link.a === node ? link.b : link.a;
    if (anchors.has(next)) continue;
    const value = Math.sign(offset) * Math.max(0, Math.abs(offset) - link.length * 0.03);
    if (Math.abs(value) > Math.abs(offsets.get(next) || 0) + 0.001) { offsets.set(next, value); pending.push(next); }
  }
}

function segmentEndAt(track, station) {
  let lo = 0, hi = track.pts.length - 1;
  while (hi - lo > 1) { const mid = (hi + lo) >> 1; if (track.distances[mid] < station) lo = mid; else hi = mid; }
  return hi;
}

/** Route lookahead needs the mapped tangent without terrain, road or junction-height queries. */
function trackTangent(track, station) {
  const s = Math.max(0, Math.min(track.length, station)), hi = segmentEndAt(track, s), lo = Math.max(0, hi - 1);
  const a = track.pts[lo], b = track.pts[hi], span = track.distances[hi] - track.distances[lo] || 1;
  return { dx: (b.x - a.x) / span, dz: (b.z - a.z) / span };
}

/** Shared arc-length sampling keeps rails, sleepers, wires and future rail vehicles on one profile. */
function trackPoint(track, station, lateral = 0) {
  const s = Math.max(0, Math.min(track.length, station)), hi = segmentEndAt(track, s), lo = Math.max(0, hi - 1);
  const a = track.pts[lo], b = track.pts[hi], span = track.distances[hi] - track.distances[lo] || 1;
  const u = (s - track.distances[lo]) / span, dx = (b.x - a.x) / span, dz = (b.z - a.z) / span;
  const x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u;
  const offset = (offsets.get(track.nodes[lo]) || 0) * (1 - u) + (offsets.get(track.nodes[hi]) || 0) * u;
  const ground = track.bridge || track.tunnel ? groundSurfaceHeight(a.x, a.z) * (1 - u) + groundSurfaceHeight(b.x, b.z) * u : groundSurfaceHeight(x, z);
  let y = ground + offset + 0.18;
  const bed = track.bedSpans?.find((p) => s >= p.start && s <= p.end);
  const underpass = track.kind === 'tram' && track.tunnel && NYC.TRAM_UNDERPASSES?.find((g) => g.tracks.includes(track.id));
  if (underpass) y = underpass.floor + (bed?.bed === 'embedded' ? -0.24 : 0.18);
  else if (track.kind === 'tram') {
    const road = NYC.nearestRoads(x, z, 30).find((p) => !p.road.walk && p.road.layer === track.layer && !!p.road.bridge === track.bridge && !!p.road.tunnel === track.tunnel &&
      (bed?.bed !== 'embedded' || p.road.id === bed.roadId));
    if (road) {
      const w = track.tunnel || track.bridge ? 1 : Math.max(0, Math.min(1, (road.road.w / 2 + 8 - road.dist) / 8));
      const surface = road.road.gradeSamples ? NYC.roadHeight(road.road, road.x, road.z) : groundSurfaceHeight(road.x, road.z);
      const level = surface + ((track.tunnel || track.bridge) && bed?.bed !== 'embedded' ? 0.18 : -0.24);
      y += (level - y) * w * w * (3 - 2 * w);
    }
  }
  const correction = corrections.get(track);
  if (correction) y += correction[lo] * (1 - u) + correction[hi] * u;
  return { x: x - dz * lateral, z: z + dx * lateral, y, dx, dz, nx: -dz, nz: dx, bed: bed?.bed || 'reserved' };
}

const junctions = new Map();
for (const t of tracks) {
  if (t.kind !== 'tram') continue;
  for (let i = 0; i < t.nodes.length; i++) {
    const node = t.nodes[i], p = trackPoint(t, t.distances[i]);
    if (!junctions.has(node)) junctions.set(node, []);
    junctions.get(node).push({ track: t, index: i, height: p.y, embedded: p.bed === 'embedded' });
  }
}
for (const candidates of junctions.values()) {
  if (candidates.length < 2) continue;
  const structural = candidates.filter((p) => p.track.bridge || p.track.tunnel), pool = structural.length ? structural : candidates;
  const layer = Math.max(...pool.map((p) => p.track.layer));
  const level = pool.filter((p) => p.track.layer === layer), embedded = level.filter((p) => p.embedded);
  const preferred = (embedded.length ? embedded : level).map((p) => p.height).sort((a, b) => a - b);
  const target = (preferred[Math.floor((preferred.length - 1) / 2)] + preferred[Math.floor(preferred.length / 2)]) / 2;
  for (const p of candidates) {
    if (!corrections.has(p.track)) corrections.set(p.track, p.track.nodes.map(() => 0));
    corrections.get(p.track)[p.index] = target - p.height;
  }
}

const cellSize = 256, grid = new Map();
for (const t of tracks) for (let i = 1; i < t.pts.length; i++) {
  const a = t.pts[i - 1], b = t.pts[i], margin = t.tracks * 5 / 2 + 60;
  for (let x = Math.floor((Math.min(a.x, b.x) - margin) / cellSize); x <= Math.floor((Math.max(a.x, b.x) + margin) / cellSize); x++) {
    for (let z = Math.floor((Math.min(a.z, b.z) - margin) / cellSize); z <= Math.floor((Math.max(a.z, b.z) + margin) / cellSize); z++) {
      const key = `${x},${z}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push({ track: t, a, b, index: i - 1, start: t.distances[i - 1], length: t.distances[i] - t.distances[i - 1] });
    }
  }
}

function nearestRailway(x, z, exclude = null, heightRange = null) {
  let best = null;
  for (const item of grid.get(`${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`) || []) {
    const { a, b, length, start, track } = item;
    if (track === exclude) continue;
    const u = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / (length ** 2 || 1)));
    const distance = Math.hypot(x - a.x - u * (b.x - a.x), z - a.z - u * (b.z - a.z));
    if (best && distance >= best.distance) continue;
    const s = start + u * length, p = trackPoint(track, s);
    if (heightRange && (p.y < heightRange.minY || p.y > heightRange.maxY)) continue;
    best = { track, s, distance, ...p };
  }
  return best;
}

/** Keep trees out of at-grade track beds without clearing forest above tunnels. */
function railwayAt(x, z, clearance = 0, includeTunnels = false) {
  for (const item of grid.get(`${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`) || []) {
    if (item.track.tunnel && !includeTunnels) continue;
    const { a, b, length, track } = item;
    const u = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / (length ** 2 || 1)));
    if (Math.hypot(x - a.x - u * (b.x - a.x), z - a.z - u * (b.z - a.z)) < (track.tracks - 1) * 2.5 + 2.4 + clearance) return track;
  }
  return null;
}

/** Open railway approaches descend into mapped portals while the forest remains above covered tunnel interiors. */
function railwayGroundMeshHeight(x, z, height) {
  for (const item of grid.get(`${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`) || []) {
    const { track, a, b, length, start, index } = item;
    if (track.bridge) continue;
    const correction = corrections.get(track);
    const low = Math.min((offsets.get(track.nodes[index]) || 0) + (correction?.[index] || 0),
      (offsets.get(track.nodes[index + 1]) || 0) + (correction?.[index + 1] || 0));
    if (!track.tunnel && low >= -0.05) continue;
    const u = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / (length ** 2 || 1)));
    const distance = Math.hypot(x - a.x - u * (b.x - a.x), z - a.z - u * (b.z - a.z)), width = (track.tracks - 1) * 2.5 + 3;
    if (distance > width + 6) continue;
    const station = start + u * length;
    if (track.tunnel && station > 4 && station < track.length - 4) continue;
    if (track.kind === 'tram' && track.bedSpans?.some((p) => station >= p.start && station <= p.end && p.bed === 'embedded')) continue;
    const p = trackPoint(track, station);
    if (track.kind === 'tram' && p.y >= height - 0.5) continue;
    if (p.y >= height) continue;
    height += (p.y - 0.18 - height) * Math.max(0, Math.min(1, (width + 6 - distance) / 6));
  }
  return height;
}
return { data, tracks, trackPoint, trackTangent, nearestRailway, railwayAt, railwayGroundMeshHeight };
}
const network = createRailwayPaths(GEO.railways || { tracks: [], graph: { nodes: [], links: [] }, platforms: [], features: [] });

/** Mapped railway beds and structures are batched spatially. Fine sleepers and overhead equipment stream around the camera. */
export function createKazanRailways(draw, paths = network, name = 'KazanRailways', { precomputeDetails = false } = {}) {
  const { data, tracks, trackPoint, nearestRailway } = paths;
  const { plainMaterial, box, emit, flush, shapeOf } = draw;
  const group = new THREE.Group(); group.name = name;
  const prepared = services.railAssets?.[name];
  const ballast = plainMaterial(0x7a746c), steel = plainMaterial(0x929a99, 0.6), sleeper = plainMaterial(0xaaa79b);
  const concrete = plainMaterial(0xa2aaa6), metal = plainMaterial(0x555c59, 0.4), wire = plainMaterial(0x4a4640);
  const earth = plainMaterial(0x847960), platform = plainMaterial(0xb5b4a9), edge = plainMaterial(0xe1d4a5);
  const cells = new Map(), base = new THREE.Group(), platforms = new THREE.Group();
  base.name = 'RailBed'; platforms.name = 'RailPlatforms'; group.add(base, platforms);
  function tile(x, z) {
    const key = `${Math.floor(x / 512)},${Math.floor(z / 512)}`;
    if (!cells.has(key)) {
      cells.set(key, { x: (Math.floor(x / 512) + 0.5) * 512, z: (Math.floor(z / 512) + 0.5) * 512, segments: [], detail: null });
    }
    return cells.get(key);
  }
  function beam(target, a, b, width, depth, material) {
    const start = new THREE.Vector3(a.x, a.y, a.z), end = new THREE.Vector3(b.x, b.y, b.z), delta = end.clone().sub(start);
    const length = delta.length();
    if (length < 0.001) return;
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), delta.multiplyScalar(1 / length));
    box(target, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, width, depth, length, material, 0, rotation);
  }
  function shifted(p, lateral, height) {
    return { x: p.x + p.nx * lateral, y: p.y + height, z: p.z + p.nz * lateral };
  }
  function sharedTunnelSide(track, p) {
    if (track.kind !== 'tram') return false;
    const road = NYC.nearestRoads(p.x, p.z, 20).some((q) => !q.road.walk && q.road.tunnel &&
      q.dist < q.road.w / 2 + 1 && Math.abs(NYC.roadHeight(q.road, q.x, q.z) - p.y) < 1);
    const other = nearestRailway(p.x, p.z, track, { minY: p.y - 1, maxY: p.y + 1 });
    return road || other && other.track.tunnel && other.distance < 2.5 && Math.abs(other.y - p.y) < 1;
  }
  if (!prepared) for (const t of tracks) {
    base.userData.preparedLevel = t.bridge || t.tunnel ? 'structure' : 'bed';
    for (let i = 1; i < t.pts.length; i++) {
      const start = t.distances[i - 1], length = t.distances[i] - start, count = Math.max(1, Math.ceil(length / (t.kind === 'tram' ? 4 : 12)));
      for (let j = 0; j < count; j++) {
        const s = start + length * j / count, end = start + length * (j + 1) / count;
        const a = trackPoint(t, s), b = trackPoint(t, end), cell = tile((a.x + b.x) / 2, (a.z + b.z) / 2);
        if (t.tunnel) {
          for (const side of [-1, 1]) {
            const mid = shifted(trackPoint(t, (s + end) / 2), side * 2.5, 0);
            if (sharedTunnelSide(t, mid)) continue;
            beam(base, shifted(a, side * 2.5, 3.3), shifted(b, side * 2.5, 3.3), 0.5, 6.6, concrete);
          }
          beam(base, shifted(a, 0, 6.85), shifted(b, 0, 6.85), 5.5, 0.5, concrete);
        }
        cell.segments.push({ track: t, start: s, end });
        for (let n = 0; n < t.tracks; n++) {
          const lateral = (n - (t.tracks - 1) / 2) * 5;
          if (a.bed !== 'embedded' && b.bed !== 'embedded') beam(base, shifted(a, lateral, 0), shifted(b, lateral, 0), t.kind === 'tram' ? 3.2 : 3.8, 0.3, ballast);
          for (const side of [-1, 1]) {
            const gauge = t.gauge[0] / 1000;
            beam(base, shifted(a, lateral + side * (gauge / 2 + 0.035), 0.24), shifted(b, lateral + side * (gauge / 2 + 0.035), 0.24), 0.07, 0.15, steel);
          }
        }
        if (t.bridge) {
          beam(base, shifted(a, 0, -0.55), shifted(b, 0, -0.55), (t.tracks - 1) * 5 + 4.8, 0.8, concrete);
          for (const side of [-1, 1]) beam(base, shifted(a, side * ((t.tracks - 1) * 2.5 + 2.25), 0.7), shifted(b, side * ((t.tracks - 1) * 2.5 + 2.25), 0.7), 0.12, 0.12, metal);
          if (Math.floor(s / 32) !== Math.floor(end / 32)) {
            const p = trackPoint(t, Math.floor(end / 32) * 32), bottom = terrainHeight(p.x, p.z), h = p.y - bottom - 1;
            if (h > 1) box(base, p.x, bottom + h / 2, p.z, 1.2, h, 2, concrete);
          }
        } else {
          const mid = trackPoint(t, (s + end) / 2), bottom = groundSurfaceHeight(mid.x, mid.z), h = mid.y - bottom;
          if (h > 0.35) box(base, mid.x, bottom + h / 2 - 0.1, mid.z, end - s + 0.1, h, (t.tracks - 1) * 5 + 4.4, earth, -Math.atan2(mid.dz, mid.dx));
        }
      }
    }
    if (t.tunnel) for (const station of [0, t.length]) {
      const p = trackPoint(t, station), width = (t.tracks - 1) * 5 + 5;
      for (const side of [-1, 1]) {
        if (sharedTunnelSide(t, shifted(p, side * width / 2, 0))) continue;
        box(group, p.x + p.nx * side * width / 2, p.y + 3.3, p.z + p.nz * side * width / 2, 0.65, 6.6, 2, concrete, -Math.atan2(p.dz, p.dx));
      }
      box(group, p.x, p.y + 6.85, p.z, width + 0.7, 0.5, 2, concrete, -Math.atan2(p.dz, p.dx) + Math.PI / 2);
    }
  }
  for (const p of data.platforms) {
    for (const ring of p.rings) {
      const geometry = new THREE.ExtrudeGeometry(shapeOf(ring), { depth: p.height, bevelEnabled: false });
      geometry.rotateX(-Math.PI / 2);
      const attr = geometry.attributes.position;
      for (let i = 0; i < attr.count; i++) {
        const near = nearestRailway(attr.getX(i), attr.getZ(i));
        attr.setY(i, attr.getY(i) + (near?.y ?? terrainHeight(attr.getX(i), attr.getZ(i))) + 0.15);
      }
      geometry.computeVertexNormals(); emit(platforms, geometry, platform);
      const poly = toPoints(ring);
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], na = nearestRailway(a.x, a.z), nb = nearestRailway(b.x, b.z);
        if (!na || !nb) continue;
        beam(platforms, { ...a, y: na.y + p.height + 0.17 }, { ...b, y: nb.y + p.height + 0.17 }, 0.18, 0.04, edge);
      }
    }
    if (p.pts) {
      const poly = toPoints(p.pts);
      for (let i = 1; i < poly.length; i++) {
        const a = nearestRailway(poly[i - 1].x, poly[i - 1].z), b = nearestRailway(poly[i].x, poly[i].z);
        if (a && b) beam(platforms, { ...poly[i - 1], y: a.y + p.height / 2 }, { ...poly[i], y: b.y + p.height / 2 }, p.width, p.height, platform);
      }
    }
  }
  flush(base);
  flush(group); flush(platforms);
  if (prepared) {
    prepared.attach(group, plainMaterial);
    return { group, update: prepared.update };
  }
  function detail(cell) {
    const target = new THREE.Group(); target.name = 'RailSleepersAndCatenary';
    target.userData.regionCenter = [cell.x, cell.z];
    for (const { track: t, start, end } of cell.segments) {
      for (let s = Math.ceil(start / 0.65) * 0.65; s < end; s += 0.65) {
        const p = trackPoint(t, s);
        if (p.bed === 'embedded') continue;
        for (let n = 0; n < t.tracks; n++) {
          const v = shifted(p, (n - (t.tracks - 1) / 2) * 5, 0.1);
          box(target, v.x, v.y, v.z, 0.24, 0.16, Math.max(1.6, t.gauge[0] / 1000 + 1.1), sleeper, -Math.atan2(p.dz, p.dx));
        }
      }
      if (t.electrified !== 'contact_line') continue;
      const a = trackPoint(t, start), b = trackPoint(t, end);
      for (let n = 0; n < t.tracks; n++) {
        const lateral = (n - (t.tracks - 1) / 2) * 5;
        beam(target, shifted(a, lateral, 5.8), shifted(b, lateral, 5.8), 0.035, 0.035, wire);
        beam(target, shifted(a, lateral, 6.55), shifted(b, lateral, 6.55), 0.035, 0.035, wire);
      }
      for (let s = Math.ceil(start / 48) * 48; s < end; s += 48) {
        const p = trackPoint(t, s), outside = (t.tracks - 1) * 2.5 + 3.1, v = shifted(p, outside, 3.7);
        box(target, v.x, v.y, v.z, 0.23, 7.4, 0.23, concrete);
        beam(target, shifted(p, outside, 6.7), shifted(p, -outside + 2, 6.7), 0.09, 0.12, metal);
      }
      for (let s = Math.ceil(start / 8) * 8; s < end; s += 8) {
        const p = trackPoint(t, s);
        beam(target, shifted(p, 0, 5.8), shifted(p, 0, 6.55), 0.025, 0.025, wire);
      }
    }
    flush(target); group.add(target); cell.detail = target;
  }
  let lastCell = '';
  function update(x, z) {
    const key = `${Math.floor(x / 256)},${Math.floor(z / 256)}`;
    if (key === lastCell) return;
    lastCell = key;
    for (const cell of cells.values()) {
      const distance = Math.hypot(x - cell.x, z - cell.z);
      if (distance < (runtime?.lite ? 650 : 1200) && !cell.detail) detail(cell);
      if (distance > (runtime?.lite ? 1100 : 1800) && cell.detail) {
        group.remove(cell.detail); cell.detail.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); } }); cell.detail = null;
      }
    }
  }
  if (precomputeDetails) for (const cell of cells.values()) detail(cell);
  return { group, update };
}
window.NYC = { ...NYC, RAIL_TRACKS: network.tracks, trackPoint: network.trackPoint, nearestRailway: network.nearestRailway,
  railwayAt: network.railwayAt, railwayGroundMeshHeight: network.railwayGroundMeshHeight, createRailwayPaths, createKazanRailways };
})();
