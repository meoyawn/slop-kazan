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
const BRIDGE_GRID = new Map();
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
    if (r.bridge) insert(BRIDGE_GRID, segment, { minX: box.minX - r.w, maxX: box.maxX + r.w, minZ: box.minZ - r.w, maxZ: box.maxZ + r.w });
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

function bridgeHeight(road, distance) {
  const a = road.pts[0], b = road.pts[road.pts.length - 1];
  const t = Math.max(0, Math.min(1, distance / (road.length || 1)));
  return terrainHeight(a.x, a.z) * (1 - t) + terrainHeight(b.x, b.z) * t + Math.sin(t * Math.PI) * 8;
}

/** Shared driving/walking surface for road meshes, markings, traffic and player physics. */
function surfaceHeight(x, z) {
  let height = terrainHeight(x, z);
  for (const segment of BRIDGE_GRID.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) || []) {
    const p = project(segment, x, z);
    if (p.dist < segment.r.w / 2 + 2.5) height = Math.max(height, bridgeHeight(segment.r, segment.start + p.t * segment.length));
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
      return { x: p.x, z: p.z, heading: p.dist < 1 ? p.heading : Math.atan2(x - p.x, z - p.z) };
    }
  }
  return null;
}

const TELEPORT_LOCATIONS = Object.fromEntries(['kremlin', 'kulsharif', 'bauman', 'palace', 'family', 'kaban', 'millennium', 'blacklake', 'taif', 'tatneft', 'makary', 'parkhouse', ...(GEO.coverage?.checkpoints || []).map((p) => p.id)].map((id) => {
  const target = NYC_LANDMARKS.find((l) => l.id === id);
  const arrival = roadArrival(target.x, target.z);
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
  terrainHeight, surfaceHeight, waterAt, isOnLand, buildingAt, blockAt, nearestRoads, roadArrival, getLocationLabel, parkingAt,
  TERRAIN_PATCHES, HELIPADS, landingSurfaceAt, landcoverAt, isTypingInField, SIGNAL_TIMING, signalPhase, walkSignal, toPoints, boundsOf, pointInPoly };
})();
