(function () {
const { GEO } = window.NYC;
const ISLAND_BOUNDS = { ...GEO.bounds, sidewalkHeight: 0.14, waterLevel: 0 };
const toPoints = (flat) => Array.from({ length: flat.length / 2 }, (_, i) => ({ x: flat[i * 2], z: flat[i * 2 + 1] }));
const ROADS = GEO.roads.map((r) => ({ ...r, raw: r.localName, pts: toPoints(r.pts) }));
const NYC_LANDMARKS = GEO.landmarks;
const LANDMARK_SITES = Object.fromEntries(NYC_LANDMARKS.map((l) => [l.name, l]));
const CELL = 64;

const LANDCOVER = GEO.landcover;
const LANDCOVER_CELLS = new Uint8Array(LANDCOVER.cols * LANDCOVER.rows);
let coverOffset = 0;
for (let i = 0; i < LANDCOVER.runs.length; i += 2) {
  LANDCOVER_CELLS.fill(LANDCOVER.runs[i], coverOffset, coverOffset + LANDCOVER.runs[i + 1]);
  coverOffset += LANDCOVER.runs[i + 1];
}

/** ESA cover class at a ground point; tree cover is an area observation, not a tree inventory. */
function landcoverAt(x, z) {
  const col = Math.round((x - LANDCOVER.x0) / LANDCOVER.step), row = Math.round((z - LANDCOVER.z0) / LANDCOVER.step);
  return col < 0 || row < 0 || col >= LANDCOVER.cols || row >= LANDCOVER.rows ? 0 : LANDCOVER_CELLS[row * LANDCOVER.cols + col];
}

function pointInPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function boundsOf(poly) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const p of poly) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  return { minX, maxX, minZ, maxZ };
}

function insert(grid, item, bounds, cellSize = CELL) {
  for (let x = Math.floor(bounds.minX / cellSize); x <= Math.floor(bounds.maxX / cellSize); x++) {
    for (let z = Math.floor(bounds.minZ / cellSize); z <= Math.floor(bounds.maxZ / cellSize); z++) {
      const key = `${x},${z}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(item);
    }
  }
}

const ROAD_GRID = new Map();
const GRADE_GRID = new Map();
for (const r of ROADS) {
  let length = 0;
  r.distances = [0];
  for (let i = 0; i + 1 < r.pts.length; i++) {
    const a = r.pts[i], b = r.pts[i + 1];
    const segment = { r, a, b, start: length, length: Math.hypot(b.x - a.x, b.z - a.z) };
    length += segment.length;
    r.distances.push(length);
    const box = { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
    insert(ROAD_GRID, segment, box);
  }
  r.length = length;
}

function project(segment, x, z) {
  const { a, b } = segment;
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  const px = a.x + dx * t, pz = a.z + dz * t;
  return { x: px, z: pz, dist: Math.hypot(px - x, pz - z), t, heading: Math.atan2(dx, dz) };
}

function nearestRoads(x, z, radius = 60) {
  const best = new Map();
  for (let ix = Math.floor((x - radius) / CELL); ix <= Math.floor((x + radius) / CELL); ix++) {
    for (let iz = Math.floor((z - radius) / CELL); iz <= Math.floor((z + radius) / CELL); iz++) {
      for (const segment of ROAD_GRID.get(`${ix},${iz}`) || []) {
        const p = project(segment, x, z), road = segment.r;
        if (p.dist > radius || (best.has(road.name) && best.get(road.name).dist <= p.dist)) continue;
        best.set(road.name, { ...p, road, horizontal: Math.abs(segment.b.x - segment.a.x) > Math.abs(segment.b.z - segment.a.z) });
      }
    }
  }
  return [...best.values()].sort((a, b) => a.dist - b.dist);
}

const TERRAIN_PATCHES = (GEO.elevation.patches || []).map((p) => ({ ...p,
  minX: Math.ceil(p.x0 / 30) * 30 + 30, maxX: Math.floor((p.x0 + (p.cols - 1) * p.stepX) / 30) * 30 - 30,
  minZ: Math.ceil(p.z0 / 30) * 30 + 30, maxZ: Math.floor((p.z0 + (p.rows - 1) * p.stepZ) / 30) * 30 - 30 }));

function sampleElevation(e, x, z) {
  const fx = Math.max(0, Math.min(e.cols - 1.001, (x - e.x0) / (e.stepX || e.step)));
  const fz = Math.max(0, Math.min(e.rows - 1.001, (z - e.z0) / (e.stepZ || e.step)));
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const i = iz * e.cols + ix;
  const a = e.elevations[i] * (1 - tx) + e.elevations[i + 1] * tx;
  const b = e.elevations[i + e.cols] * (1 - tx) + e.elevations[i + e.cols + 1] * tx;
  return (a * (1 - tz) + b * tz) / 10 - e.datum;
}

/** Ground altitude with source-grid hill patches blended into the regional FABDEM grid. */
function terrainHeight(x, z) {
  const bounds = GEO.nearTerrainBounds;
  const e = x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ ? GEO.elevation : GEO.elevation.far;
  const base = sampleElevation(e, x, z);
  for (const patch of TERRAIN_PATCHES) {
    const edge = Math.min(x - patch.minX, patch.maxX - x, z - patch.minZ, patch.maxZ - z);
    if (edge >= 0) return base + (sampleElevation(patch, x, z) - base) * Math.min(1, edge / 60);
  }
  return base;
}

function stationAt(road, x, z) {
  let best = Infinity, station = 0;
  for (let i = 1; i < road.pts.length; i++) {
    const p = project({ a: road.pts[i - 1], b: road.pts[i] }, x, z);
    if (p.dist < best) { best = p.dist; station = road.distances[i - 1] + p.t * (road.distances[i] - road.distances[i - 1]); }
  }
  return station;
}

/** Mapped topology fixes the levels; unavailable engineering elevations use explicit clearance and ramp estimates. */
function prepareRoadGrades() {
  const graph = GEO.roadGraph, incident = new Map(), adjacent = new Map(), marks = new Map();
  const offsets = new Map(), fixed = new Set(), queue = [];
  function point(node) {
    return { x: graph.nodes[node * 2], z: graph.nodes[node * 2 + 1] };
  }
  function anchor(node, value) {
    if (fixed.has(node) && Math.abs(offsets.get(node)) >= Math.abs(value)) return;
    fixed.add(node); offsets.set(node, value);
    if (value) queue.push([node, value]);
  }
  for (const [a, b, , , , , inner, roadIndex] of graph.links) {
    const road = ROADS[roadIndex];
    if (!road) continue;
    const p = point(a), q = point(b);
    let x = p.x, z = p.z, length = 0;
    for (let i = 0; i < inner.length; i += 2) {
      length += Math.hypot(inner[i] - x, inner[i + 1] - z); x = inner[i]; z = inner[i + 1];
    }
    length += Math.hypot(q.x - x, q.z - z);
    for (const [node, other] of [[a, b], [b, a]]) {
      if (!incident.has(node)) { incident.set(node, new Set()); adjacent.set(node, []); }
      incident.get(node).add(road); adjacent.get(node).push({ node: other, length, road });
    }
  }
  for (const [node, roads] of incident) {
    const p = point(node), ground = terrainHeight(p.x, p.z);
    for (const road of roads) {
      if (road.tunnel) anchor(node, -6 * Math.max(1, Math.abs(road.layer)));
      else if (road.bridge) {
        const t = stationAt(road, p.x, p.z) / road.length, a = road.pts[0], b = road.pts.at(-1);
        const deck = terrainHeight(a.x, a.z) * (1 - t) + terrainHeight(b.x, b.z) * t +
          (road.length >= 350 ? Math.sin(Math.PI * t) * 8 : 6 * Math.max(1, road.layer));
        anchor(node, deck - ground);
      } else if (road.layer > 0) {
        const upper = [...roads].some((r) => r !== road && (r.bridge || r.layer > 0));
        anchor(node, upper ? 6 * road.layer : 0);
      }
    }
    if (!fixed.has(node) && roads.size >= 3) anchor(node, 0);
  }
  for (let head = 0; head < queue.length; head++) {
    const [node, value] = queue[head];
    if (offsets.get(node) !== value) continue;
    for (const link of adjacent.get(node) || []) {
      if (fixed.has(link.node) || link.road.bridge || link.road.tunnel || link.road.layer > 0) continue;
      const next = Math.sign(value) * Math.max(0, Math.abs(value) - link.length * 0.06);
      if (Math.abs(next) <= Math.abs(offsets.get(link.node) || 0)) continue;
      offsets.set(link.node, next); queue.push([link.node, next]);
    }
  }
  for (const [node, roads] of incident) {
    const p = point(node), offset = offsets.get(node) || 0;
    for (const road of roads) {
      if (!marks.has(road)) marks.set(road, []);
      marks.get(road).push({ s: stationAt(road, p.x, p.z), offset });
    }
  }
  const patches = [];
  for (const road of ROADS) {
    const knots = (marks.get(road) || []).sort((a, b) => a.s - b.s);
    if (!road.bridge && !road.tunnel && !road.layer && !knots.some((p) => Math.abs(p.offset) > 0.05)) continue;
    const samples = [], a = road.pts[0], b = road.pts.at(-1);
    const ya = terrainHeight(a.x, a.z), yb = terrainHeight(b.x, b.z);
    const cutPoints = [];
    for (let i = 1; i < road.pts.length; i++) {
      const p = road.pts[i - 1], q = road.pts[i], start = road.distances[i - 1], span = road.distances[i] - start;
      const steps = Math.max(1, Math.ceil(span / 12));
      for (let j = i === 1 ? 0 : 1; j <= steps; j++) {
        const s = start + span * j / steps, x = p.x + (q.x - p.x) * j / steps, z = p.z + (q.z - p.z) * j / steps;
        const t = s / road.length, ground = terrainHeight(x, z);
        let height = ground;
        if (road.tunnel) height -= 6 * Math.max(1, Math.abs(road.layer));
        else if (road.bridge) height = Math.max(ground, ya * (1 - t) + yb * t + (road.length >= 350 ? Math.sin(Math.PI * t) * 8 : 6 * Math.max(1, road.layer)));
        else if (road.layer > 0) {
          const left = knots.findLast((p) => p.s <= s) || { s: 0, offset: 0 };
          const right = knots.find((p) => p.s >= s) || { s: road.length, offset: 0 };
          const u = (s - left.s) / (right.s - left.s || 1);
          height += left.offset * (1 - u) + right.offset * u;
        } else {
          const left = knots.findLast((p) => p.s <= s) || { s: 0, offset: 0 };
          const right = knots.find((p) => p.s >= s) || { s: road.length, offset: 0 };
          const u = (s - left.s) / (right.s - left.s || 1);
          let offset = left.offset * (1 - u) + right.offset * u;
          if (!left.offset || !right.offset) {
            const end = left.offset ? left : right;
            offset = Math.sign(end.offset) * Math.min(Math.abs(offset), Math.max(0, Math.abs(end.offset) - Math.abs(s - end.s) * 0.06));
          }
          height += offset;
        }
        samples.push(s, height);
        if (height < ground - 0.15) cutPoints.push({ x, z });
      }
    }
    road.gradeSamples = samples;
    road.gradeSource = 'estimated-clearance';
    if (cutPoints.length && !road.tunnel && !road.covered && !road.walk) {
      const bounds = boundsOf(cutPoints), margin = road.w / 2 + 14;
      patches.push({ minX: Math.floor((bounds.minX - margin) / 30) * 30, maxX: Math.ceil((bounds.maxX + margin) / 30) * 30,
        minZ: Math.floor((bounds.minZ - margin) / 30) * 30, maxZ: Math.ceil((bounds.maxZ + margin) / 30) * 30 });
    }
    for (let i = 1; i < road.pts.length; i++) {
      const a = road.pts[i - 1], b = road.pts[i], margin = road.w / 2 + 12;
      insert(GRADE_GRID, { r: road, a, b, start: road.distances[i - 1], length: road.distances[i] - road.distances[i - 1] },
        { minX: Math.min(a.x, b.x) - margin, maxX: Math.max(a.x, b.x) + margin, minZ: Math.min(a.z, b.z) - margin, maxZ: Math.max(a.z, b.z) + margin });
    }
  }
  for (let i = 0; i < patches.length; i++) for (let j = i + 1; j < patches.length; j++) {
    const a = patches[i], b = patches[j];
    if (a.maxX < b.minX || a.minX > b.maxX || a.maxZ < b.minZ || a.minZ > b.maxZ) continue;
    patches[i] = { minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX), minZ: Math.min(a.minZ, b.minZ), maxZ: Math.max(a.maxZ, b.maxZ) };
    patches.splice(j, 1); i = -1; break;
  }
  return patches;
}

const ROAD_TERRAIN_PATCHES = prepareRoadGrades();

function sampleRoadGrade(road, distance) {
  const samples = road.gradeSamples;
  let lo = 0, hi = samples.length / 2 - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (samples[mid * 2] < distance) lo = mid; else hi = mid; }
  const t = Math.max(0, Math.min(1, (distance - samples[lo * 2]) / (samples[hi * 2] - samples[lo * 2] || 1)));
  return samples[lo * 2 + 1] * (1 - t) + samples[hi * 2 + 1] * t;
}

/** A road's own deck remains continuous across lanes and never selects a crossing underneath it. */
function roadHeight(road, x, z) {
  if (!road?.gradeSamples) return terrainHeight(x, z);
  return sampleRoadGrade(road, stationAt(road, x, z));
}

/** Open approaches cut the ground; covered tunnels retain their terrain roof. */
function groundSurfaceHeight(x, z) {
  const ground = terrainHeight(x, z);
  let height = ground;
  for (const segment of GRADE_GRID.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) || []) {
    const road = segment.r;
    if (road.tunnel || road.covered || road.walk) continue;
    const p = project(segment, x, z), shoulder = road.w / 2 + 2.6;
    if (p.dist > shoulder + 8) continue;
    const surface = sampleRoadGrade(road, segment.start + p.t * segment.length);
    height = Math.min(height, ground + (surface - ground) * Math.max(0, Math.min(1, (shoulder + 8 - p.dist) / 8)));
  }
  return height;
}

/** Select the closest reachable surface for an entity; map arrivals can request the upper surface. */
function surfaceHeight(x, z, referenceY) {
  let height = groundSurfaceHeight(x, z);
  for (const segment of GRADE_GRID.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) || []) {
    const p = project(segment, x, z);
    if (p.dist >= segment.r.w / 2 + 2.5) continue;
    const candidate = sampleRoadGrade(segment.r, segment.start + p.t * segment.length);
    if (Number.isFinite(referenceY) ? Math.abs(candidate - referenceY) < Math.abs(height - referenceY) : candidate > height) height = candidate;
  }
  return height;
}

const HELIPADS = (GEO.helipads || []).map((p) => {
  const poly = toPoints(p.ring), building = GEO.buildings.find((b) => `${b.osmType}/${b.id}` === p.building);
  const foundation = building ? Math.max(...toPoints(building.ring).map((v) => terrainHeight(v.x, v.z))) : terrainHeight(p.x, p.z);
  return { ...p, poly, ...boundsOf(poly), y: foundation + p.height };
});

/** A landing surface is usable only when the aircraft's full clearance fits inside its mapped edge. */
function landingSurfaceAt(x, z, clearance = 0) {
  for (const pad of HELIPADS) {
    if (x < pad.minX || x > pad.maxX || z < pad.minZ || z > pad.maxZ || !pointInPoly(pad.poly, x, z)) continue;
    let fits = true;
    for (let i = 0; i < pad.poly.length; i++) {
      const a = pad.poly[i], b = pad.poly[(i + 1) % pad.poly.length], dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(x - a.x - dx * t, z - a.z - dz * t) < clearance) { fits = false; break; }
    }
    if (fits) return pad;
  }
  return null;
}

const WATER = GEO.water.flatMap((w) => w.rings.map((ring) => {
  const poly = toPoints(ring);
  return { ...boundsOf(poly), poly, holes: w.holes.map(toPoints), name: w.name };
}));
const WATER_GRID = new Map();
for (const w of WATER) insert(WATER_GRID, w, w, 256);

function waterAt(x, z) {
  for (const w of WATER_GRID.get(`${Math.floor(x / 256)},${Math.floor(z / 256)}`) || []) {
    if (x < w.minX || x > w.maxX || z < w.minZ || z > w.maxZ) continue;
    if (pointInPoly(w.poly, x, z) && !w.holes.some((h) => pointInPoly(h, x, z))) return w;
  }
  return null;
}

function isOnLand(x, z) {
  if (x < ISLAND_BOUNDS.minX || x > ISLAND_BOUNDS.maxX || z < ISLAND_BOUNDS.minZ || z > ISLAND_BOUNDS.maxZ) return false;
  if (!waterAt(x, z)) return true;
  return nearestRoads(x, z, 30).some(({ road, dist }) => road.bridge && dist < road.w / 2 + 1);
}

const BLOCKS = GEO.buildings.filter((b) => !b.part).map((b) => {
  const poly = toPoints(b.ring), bounds = boundsOf(poly);
  return { ...bounds, id: b.id, poly, holes: b.holes.map(toPoints).filter((h) => pointInPoly(poly, h[0].x, h[0].z)), park: 0, parkName: '', median: false, rect: false,
    rects: [], frames: null, cx: (bounds.minX + bounds.maxX) / 2, cz: (bounds.minZ + bounds.maxZ) / 2 };
});
const BLOCK_GRID = new Map();
for (const b of BLOCKS) insert(BLOCK_GRID, b, b);

const PARKING_GRID = new Map();
for (const p of GEO.parkings || []) {
  const lot = { ...p, polygons: p.rings.map(toPoints), inner: p.holes.map(toPoints) };
  insert(PARKING_GRID, lot, p.bounds);
}

function parkingAt(x, z) {
  for (const p of PARKING_GRID.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) || []) {
    if (p.polygons.some((ring) => pointInPoly(ring, x, z)) && !p.inner.some((ring) => pointInPoly(ring, x, z))) return p;
  }
  return null;
}

function buildingAt(x, z) {
  for (const b of BLOCK_GRID.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) || []) {
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && pointInPoly(b.poly, x, z) && !b.holes.some((h) => pointInPoly(h, x, z))) return b;
  }
  return null;
}

function blockAt(x, z) {
  const b = buildingAt(x, z);
  if (b) return b;
  const near = nearestRoads(x, z, 24).find(({ road }) => !road.walk);
  if (near && near.dist > near.road.w / 2 && near.dist < near.road.w / 2 + 4.5 && isOnLand(x, z)) return { park: 0, median: false };
  return null;
}

function roadArrival(x, z) {
  for (const radius of [100, 250, 600, 1200]) {
    const near = nearestRoads(x, z, radius);
    for (const p of near) {
      if (p.road.walk || p.road.parking || buildingAt(p.x, p.z) || !isOnLand(p.x, p.z)) continue;
      return { x: p.x, z: p.z, y: roadHeight(p.road, p.x, p.z) + 0.07, heading: p.dist < 1 ? p.heading : Math.atan2(x - p.x, z - p.z) };
    }
  }
  return null;
}

const TELEPORT_LOCATIONS = Object.fromEntries(['kremlin', 'kulsharif', 'bauman', 'palace', 'family', 'kaban', 'millennium', 'blacklake', 'taif', 'tatneft', 'makary', 'parkhouse', 'riviera', 'bahetle', 'kishmish', 'tandem', ...(GEO.coverage?.checkpoints || []).map((p) => p.id)].map((id) => {
  const target = NYC_LANDMARKS.find((l) => l.id === id);
  const arrival = roadArrival(target.entry?.x ?? target.x, target.entry?.z ?? target.z);
  if (!arrival) throw new Error(`No road arrival at ${target.name}`);
  return [id, arrival];
}));
const spawnRoad = nearestRoads(TELEPORT_LOCATIONS.kremlin.x, TELEPORT_LOCATIONS.kremlin.z, 30).find(({ road }) => !road.walk);
const SPAWN = { ...TELEPORT_LOCATIONS.kremlin, heading: spawnRoad?.heading ?? TELEPORT_LOCATIONS.kremlin.heading };

function getLocationLabel(x, z) {
  const landmark = NYC_LANDMARKS.find((l) => Math.hypot(l.x - x, l.z - z) < 85);
  if (landmark) return landmark.name;
  const water = waterAt(x, z);
  if (water) return water.name || 'Kazan waterfront';
  const near = nearestRoads(x, z, 100).filter(({ road }) => road.localName);
  if (near.length > 1 && near[1].dist < 24 && near[0].road.name !== near[1].road.name) return `${near[0].road.name} & ${near[1].road.name}`;
  return near[0]?.road.name || 'Kazan · Tatarstan';
}

function isTypingInField(e) {
  return e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT');
}

const SIGNAL_TIMING = { cycle: 60, avenueAmber: 26, avenueRed: 30, streetAmber: 56, walk: 7 };
function signalPhase(time, isAvenue) {
  const t = ((time % 60) + 60) % 60;
  if (isAvenue) return t < 26 ? 'green' : t < 30 ? 'amber' : 'red';
  return t < 30 ? 'red' : t < 56 ? 'green' : 'amber';
}
function walkSignal(time, isAvenue) {
  return (((time - (isAvenue ? 0 : 30)) % 60) + 60) % 60 < 7;
}

window.NYC = { ...window.NYC, ROADS, BLOCKS, NYC_LANDMARKS, LANDMARK_SITES, TELEPORT_LOCATIONS, SPAWN, ISLAND_BOUNDS,
  CENTRAL_PARK_BOUNDS: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
  AVENUES: [], ALL_AVENUES: [], STREETS: [], ALL_STREETS: [],
  getIslandBoundsAtZ: () => ({ westX: ISLAND_BOUNDS.minX, eastX: ISLAND_BOUNDS.maxX }),
  terrainHeight, groundSurfaceHeight, surfaceHeight, roadHeight, ROAD_TERRAIN_PATCHES, waterAt, isOnLand, buildingAt, blockAt, nearestRoads, roadArrival, getLocationLabel, parkingAt,
  TERRAIN_PATCHES, HELIPADS, landingSurfaceAt, landcoverAt, isTypingInField, SIGNAL_TIMING, signalPhase, walkSignal, toPoints, boundsOf, pointInPoly };
})();
