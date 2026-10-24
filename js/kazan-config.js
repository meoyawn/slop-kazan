import { GEO, runtime, services } from './kazan-runtime.js';
import { createWaterSystem } from './kazan-water.js';
import { createFootprint, polygonContains, polygonBounds as footprintBounds } from './footprints.js';

export const ISLAND_BOUNDS = { ...GEO.bounds, sidewalkHeight: 0.14, waterLevel: 0 };
export const toPoints = (flat) => Array.from({ length: flat.length / 2 }, (_, i) => ({ x: flat[i * 2], z: flat[i * 2 + 1] }));
const pedestrianWays = new Set([...(GEO.pedestrianStructures?.structures || []), ...(GEO.underground?.structures || [])].flatMap((s) => s.paths.map((p) => p.id)));
export const ROADS = GEO.roads.map((r) => ({ ...r, raw: r.localName, pedestrianStructure: r.walk && pedestrianWays.has(r.id), pts: toPoints(r.pts) }));
export const NYC_LANDMARKS = GEO.landmarks;
export const LANDMARK_SITES = Object.fromEntries(NYC_LANDMARKS.map((l) => [l.name, l]));
const CELL = 64;

const LANDCOVER = GEO.landcover;
const LANDCOVER_CELLS = new Uint8Array(LANDCOVER.cols * LANDCOVER.rows);
let coverOffset = 0;
for (let i = 0; i < LANDCOVER.runs.length; i += 2) {
  LANDCOVER_CELLS.fill(LANDCOVER.runs[i], coverOffset, coverOffset + LANDCOVER.runs[i + 1]);
  coverOffset += LANDCOVER.runs[i + 1];
}

/** ESA cover class at a ground point; tree cover is an area observation, not a tree inventory. */
export function landcoverAt(x, z) {
  const col = Math.round((x - LANDCOVER.x0) / LANDCOVER.step), row = Math.round((z - LANDCOVER.z0) / LANDCOVER.step);
  return col < 0 || row < 0 || col >= LANDCOVER.cols || row >= LANDCOVER.rows ? 0 : LANDCOVER_CELLS[row * LANDCOVER.cols + col];
}

export const pointInPoly = (poly, x, z) => polygonContains(poly, x, z);

export const boundsOf = (poly) => footprintBounds(poly);

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
    if (r.kind === 'steps' && r.campus) {
      segment.treadCount = Math.min(256, Math.max(1, Math.ceil(segment.length / 0.36)));
      segment.treads = new Map();
      (r.stepSegments ||= []).push(segment);
    }
    length += segment.length;
    r.distances.push(length);
    const margin = segment.treadCount ? r.w / 2 : 0;
    const box = { minX: Math.min(a.x, b.x) - margin, maxX: Math.max(a.x, b.x) + margin,
      minZ: Math.min(a.z, b.z) - margin, maxZ: Math.max(a.z, b.z) + margin };
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

export function nearestRoads(x, z, radius = 60) {
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

export const TERRAIN_PATCHES = (GEO.elevation.patches || []).map((p) => ({ ...p,
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
export function terrainHeight(x, z) {
  const bounds = GEO.nearTerrainBounds;
  const e = x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ ? GEO.elevation : GEO.elevation.far;
  const base = sampleElevation(e, x, z);
  for (const patch of TERRAIN_PATCHES) {
    const edge = Math.min(x - patch.minX, patch.maxX - x, z - patch.minZ, patch.maxZ - z);
    if (edge >= 0) return base + (sampleElevation(patch, x, z) - base) * Math.min(1, edge / 60);
  }
  return base;
}

const waterSystem = createWaterSystem(GEO.water, terrainHeight, GEO.elevation.datum);
export const WATER_BODIES = waterSystem.bodies;

function stationAt(road, x, z) {
  let best = Infinity, station = 0;
  for (let i = 1; i < road.pts.length; i++) {
    const p = project({ a: road.pts[i - 1], b: road.pts[i] }, x, z);
    if (p.dist < best) { best = p.dist; station = road.distances[i - 1] + p.t * (road.distances[i] - road.distances[i - 1]); }
  }
  return station;
}

/** Parallel tram tracks and road lanes in one mapped underpass share an estimated floor rather than separate DEM cross-sections. */
function prepareTramUnderpasses() {
  const groups = [];
  for (const t of GEO.trams?.tracks || []) {
    if (!t.tunnel) continue;
    const p = toPoints(t.pts), a = p[0], b = p.at(-1), length = Math.hypot(b.x - a.x, b.z - a.z);
    const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2, dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
    let group = groups.find((g) => Math.hypot(g.x - x, g.z - z) < 70 && Math.abs(g.dx * dx + g.dz * dz) > 0.9);
    if (!group) { group = { x, z, dx, dz, tracks: [], roadIds: [], floorSource: 'shared-underpass-dem-estimate' }; groups.push(group); }
    group.tracks.push(t.id);
  }
  for (const g of groups) {
    const floors = [];
    for (const road of ROADS) {
      if (!road.tunnel || road.walk) continue;
      let nearest = null;
      for (let i = 1; i < road.pts.length; i++) {
        const a = road.pts[i - 1], b = road.pts[i], length = Math.hypot(b.x - a.x, b.z - a.z);
        if (!length || Math.abs((b.x - a.x) * g.dx + (b.z - a.z) * g.dz) / length < 0.8) continue;
        const p = project({ a, b }, g.x, g.z);
        if (!nearest || p.dist < nearest.dist) nearest = p;
      }
      if (!nearest || nearest.dist > road.w / 2 + 15) continue;
      g.roadIds.push(road.id);
      floors.push(terrainHeight(nearest.x, nearest.z) - 6 * Math.max(1, Math.abs(road.layer)));
    }
    floors.sort((a, b) => a - b);
    g.floor = floors.length ? (floors[Math.floor((floors.length - 1) / 2)] + floors[Math.floor(floors.length / 2)]) / 2 : terrainHeight(g.x, g.z) - 6;
  }
  return groups;
}
export const TRAM_UNDERPASSES = prepareTramUnderpasses();
const TRAM_UNDERPASS_ROADS = new Map(TRAM_UNDERPASSES.flatMap((g) => g.roadIds.map((id) => [id, g])));

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
      if (road.tunnel) anchor(node, TRAM_UNDERPASS_ROADS.has(road.id) ? TRAM_UNDERPASS_ROADS.get(road.id).floor - ground : -6 * Math.max(1, Math.abs(road.layer)));
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
    if (road.pedestrianStructure) continue;
    const knots = (marks.get(road) || []).sort((a, b) => a.s - b.s);
    if (!road.bridge && !road.tunnel && !road.layer && !knots.some((p) => Math.abs(p.offset) > 0.05)) continue;
    const samples = [], a = road.pts[0], b = road.pts.at(-1);
    const ya = terrainHeight(a.x, a.z), yb = terrainHeight(b.x, b.z);
    const cutPoints = [];
    let cutsGround = false;
    for (let i = 1; i < road.pts.length; i++) {
      const p = road.pts[i - 1], q = road.pts[i], start = road.distances[i - 1], span = road.distances[i] - start;
      const steps = Math.max(1, Math.ceil(span / 12));
      for (let j = i === 1 ? 0 : 1; j <= steps; j++) {
        const s = start + span * j / steps, x = p.x + (q.x - p.x) * j / steps, z = p.z + (q.z - p.z) * j / steps;
        const t = s / road.length, ground = terrainHeight(x, z);
        let height = ground;
        if (road.tunnel) height = TRAM_UNDERPASS_ROADS.get(road.id)?.floor ?? ground - 6 * Math.max(1, Math.abs(road.layer));
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
        if (Math.abs(height - ground) > 0.15) cutPoints.push({ x, z });
        if (height < ground - 0.15) cutsGround = true;
      }
    }
    road.gradeSamples = samples;
    road.gradeSource = 'estimated-clearance';
    if (cutPoints.length && !road.bridge && !road.walk) {
      const bounds = boundsOf(cutPoints), margin = road.w / 2 + 24;
      patches.push({ minX: Math.floor((bounds.minX - margin) / 30) * 30, maxX: Math.ceil((bounds.maxX + margin) / 30) * 30,
        minZ: Math.floor((bounds.minZ - margin) / 30) * 30, maxZ: Math.ceil((bounds.maxZ + margin) / 30) * 30,
        step: cutsGround ? 3 : 15 });
    }
    for (let i = 1; i < road.pts.length; i++) {
      const a = road.pts[i - 1], b = road.pts[i], margin = road.w / 2 + 32;
      insert(GRADE_GRID, { r: road, a, b, start: road.distances[i - 1], length: road.distances[i] - road.distances[i - 1] },
        { minX: Math.min(a.x, b.x) - margin, maxX: Math.max(a.x, b.x) + margin, minZ: Math.min(a.z, b.z) - margin, maxZ: Math.max(a.z, b.z) + margin });
    }
  }
  for (let i = 0; i < patches.length; i++) for (let j = i + 1; j < patches.length; j++) {
    const a = patches[i], b = patches[j];
    if (a.maxX < b.minX || a.minX > b.maxX || a.maxZ < b.minZ || a.minZ > b.maxZ) continue;
    patches[i] = { minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX), minZ: Math.min(a.minZ, b.minZ), maxZ: Math.max(a.maxZ, b.maxZ), step: Math.min(a.step, b.step) };
    patches.splice(j, 1); i = -1; break;
  }
  return patches;
}

export const ROAD_TERRAIN_PATCHES = prepareRoadGrades();
const RAIL_TERRAIN_PATCHES = [...(GEO.railways?.tracks || []), ...(GEO.trams?.tracks || [])].filter((t) => t.tunnel).map((t) => {
  const p = toPoints(t.pts), b = boundsOf(p);
  return { minX: Math.floor((b.minX - 250) / 30) * 30, maxX: Math.ceil((b.maxX + 250) / 30) * 30,
    minZ: Math.floor((b.minZ - 250) / 30) * 30, maxZ: Math.ceil((b.maxZ + 250) / 30) * 30, step: 3 };
});
for (let i = 0; i < RAIL_TERRAIN_PATCHES.length; i++) for (let j = i + 1; j < RAIL_TERRAIN_PATCHES.length; j++) {
  const a = RAIL_TERRAIN_PATCHES[i], b = RAIL_TERRAIN_PATCHES[j];
  if (a.maxX < b.minX || a.minX > b.maxX || a.maxZ < b.minZ || a.minZ > b.maxZ) continue;
  RAIL_TERRAIN_PATCHES[i] = { minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX), minZ: Math.min(a.minZ, b.minZ), maxZ: Math.max(a.maxZ, b.maxZ), step: 3 };
  RAIL_TERRAIN_PATCHES.splice(j, 1); i = -1; break;
}
export function excavationFloor(ring, depth) {
  const points = toPoints(ring), x = points.reduce((sum, p) => sum + p.x, 0) / points.length, z = points.reduce((sum, p) => sum + p.z, 0) / points.length;
  return Math.min(terrainHeight(x, z), ...points.map((p) => terrainHeight(p.x, p.z))) - depth;
}
const CONSTRUCTION_GRID = new Map();
export const CONSTRUCTION_TERRAIN_PATCHES = [];
for (const b of GEO.buildings) {
  const depth = b.construction?.excavationDepth;
  if (!depth || b.part) continue;
  const poly = toPoints(b.ring), bounds = boundsOf(poly), floor = excavationFloor(b.ring, depth);
  insert(CONSTRUCTION_GRID, { poly, holes: b.holes.map(toPoints), floor }, bounds);
  CONSTRUCTION_TERRAIN_PATCHES.push({ minX: Math.floor((bounds.minX - 6) / 30) * 30, maxX: Math.ceil((bounds.maxX + 6) / 30) * 30,
    minZ: Math.floor((bounds.minZ - 6) / 30) * 30, maxZ: Math.ceil((bounds.maxZ + 6) / 30) * 30 });
}
for (let i = 0; i < CONSTRUCTION_TERRAIN_PATCHES.length; i++) for (let j = i + 1; j < CONSTRUCTION_TERRAIN_PATCHES.length; j++) {
  const a = CONSTRUCTION_TERRAIN_PATCHES[i], b = CONSTRUCTION_TERRAIN_PATCHES[j];
  if (a.maxX < b.minX || a.minX > b.maxX || a.maxZ < b.minZ || a.minZ > b.maxZ) continue;
  CONSTRUCTION_TERRAIN_PATCHES[i] = { minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX), minZ: Math.min(a.minZ, b.minZ), maxZ: Math.max(a.maxZ, b.maxZ) };
  CONSTRUCTION_TERRAIN_PATCHES.splice(j, 1); i = -1; break;
}

/** Terrain patches and road surfaces share the same grid extents and triangle orientation. */
function createTerrainMeshes() {
  const near = GEO.nearTerrainBounds, far = GEO.terrainBounds, lite = runtime.lite;
  const meshes = [];
  for (let x = near.minX; x < near.maxX; x += 2880) for (let z = near.minZ; z < near.maxZ; z += 2880) {
    const tile = { minX: x, maxX: Math.min(x + 2880, near.maxX), minZ: z, maxZ: Math.min(z + 2880, near.maxZ) };
    const holes = [...TERRAIN_PATCHES, ...ROAD_TERRAIN_PATCHES, ...RAIL_TERRAIN_PATCHES, ...CONSTRUCTION_TERRAIN_PATCHES].filter((p) => p.maxX > tile.minX && p.minX < tile.maxX && p.maxZ > tile.minZ && p.minZ < tile.maxZ);
    meshes.push({ ...tile, step: lite ? Math.max(90, GEO.elevation.step) : GEO.elevation.step, holes,
      coarse: !lite && !holes.length, tile: true });
  }
  for (const patch of TERRAIN_PATCHES) meshes.push({ ...patch, step: lite ? 30 : 15, holes: [...ROAD_TERRAIN_PATCHES, ...RAIL_TERRAIN_PATCHES, ...CONSTRUCTION_TERRAIN_PATCHES] });
  for (const patch of ROAD_TERRAIN_PATCHES) meshes.push({ ...patch, step: lite ? patch.step * 2 : patch.step, holes: [...RAIL_TERRAIN_PATCHES, ...CONSTRUCTION_TERRAIN_PATCHES] });
  for (const patch of RAIL_TERRAIN_PATCHES) meshes.push({ ...patch, step: lite ? 6 : 3, holes: CONSTRUCTION_TERRAIN_PATCHES });
  for (const patch of CONSTRUCTION_TERRAIN_PATCHES) meshes.push({ ...patch, step: lite ? 6 : 3, holes: [] });
  for (const bounds of [
    { minX: far.minX, maxX: near.minX, minZ: far.minZ, maxZ: far.maxZ },
    { minX: near.maxX, maxX: far.maxX, minZ: far.minZ, maxZ: far.maxZ },
    { minX: near.minX, maxX: near.maxX, minZ: far.minZ, maxZ: near.minZ },
    { minX: near.minX, maxX: near.maxX, minZ: near.maxZ, maxZ: far.maxZ }
  ]) meshes.push({ ...bounds, step: GEO.elevation.far.step, holes: [], far: true });
  return meshes;
}

export const TERRAIN_MESHES = createTerrainMeshes(), TERRAIN_MESH_GRID = new Map();
const terrainOrder = new Map(TERRAIN_MESHES.map((mesh, index) => [mesh, index]));
for (const mesh of TERRAIN_MESHES) {
  mesh.cols = Math.ceil((mesh.maxX - mesh.minX) / mesh.step);
  mesh.rows = Math.ceil((mesh.maxZ - mesh.minZ) / mesh.step);
  mesh.stepX = (mesh.maxX - mesh.minX) / mesh.cols;
  mesh.stepZ = (mesh.maxZ - mesh.minZ) / mesh.rows;
  mesh.heights = null;
  insert(TERRAIN_MESH_GRID, mesh, mesh, 2880);
}

/** Share each DEM vertex between terrain construction, road geometry and driving-height queries. */
export function terrainVertexHeight(mesh, x, z) {
  const col = Math.round((x - mesh.minX) / mesh.stepX), row = Math.round((z - mesh.minZ) / mesh.stepZ);
  const key = row * (mesh.cols + 1) + col;
  if (!mesh.heights) mesh.heights = new Float64Array((mesh.cols + 1) * (mesh.rows + 1)).fill(NaN);
  if (Number.isNaN(mesh.heights[key])) mesh.heights[key] = groundMeshHeight(x, z);
  return mesh.heights[key];
}

/** Shore triangles are shared by visible terrain, ground roads and walking-height queries. */
export function terrainShoreFaces(mesh, col, row, upper) {
  const key = (row * mesh.cols + col) * 2 + upper;
  mesh.shoreState ||= new Uint8Array(mesh.cols * mesh.rows * 2);
  const state = mesh.shoreState[key];
  if (state === 1) return null;
  if (state === 2) return [];
  if (state === 3) return mesh.shoreFaces.get(key);
  const x0 = mesh.minX + col * mesh.stepX, z0 = mesh.minZ + row * mesh.stepZ;
  const x1 = x0 + mesh.stepX, z1 = z0 + mesh.stepZ;
  const triangle = [[x1, z0], [x0, z1], upper ? [x1, z1] : [x0, z0]];
  function sampleHeights() {
    const heights = triangle.map(([x, z]) => terrainVertexHeight(mesh, x, z));
    return heights;
  }
  const faces = waterSystem.terrainFaces(triangle, sampleHeights);
  mesh.shoreState[key] = faces === null ? 1 : faces.length ? 3 : 2;
  if (faces?.length) { mesh.shoreFaces ||= new Map(); mesh.shoreFaces.set(key, faces); }
  return faces;
}

function shoreFaceHeight(face, x, z) {
  const [a, b, c] = face;
  const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / denominator;
  const v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / denominator;
  return u >= -1e-7 && v >= -1e-7 && u + v <= 1 + 1e-7 ? a[2] * u + b[2] * v + c[2] * (1 - u - v) : null;
}

/** Moving actors can reuse one unchanged land facet without repeating the spatial/shore lookup. */
function hintedGroundHeight(hint, x, z, gridX, gridZ) {
  if (!hint.mesh || hint.gridX !== gridX || hint.gridZ !== gridZ ||
      x <= hint.x0 || x >= hint.x0 + hint.mesh.stepX || z <= hint.z0 || z >= hint.z0 + hint.mesh.stepZ) return null;
  const u = (x - hint.x0) / hint.mesh.stepX, v = (z - hint.z0) / hint.mesh.stepZ;
  if ((u + v <= 1) !== hint.upper) return null;
  for (let i = hint.meshes.length - 1; i > hint.index; i--) {
    const m = hint.meshes[i];
    if (x >= m.minX && x <= m.maxX && z >= m.minZ && z <= m.maxZ) return null;
  }
  return hint.upper ? hint.c * (1 - u - v) + hint.a * u + hint.b * v :
    hint.c * (u + v - 1) + hint.a * (1 - v) + hint.b * (1 - u);
}

function renderedGroundHeight(x, z, shoreOnly = false, hint = null) {
  if (shoreOnly && !waterSystem.nearShore(x, z)) return null;
  const gridX = Math.floor(x / 2880), gridZ = Math.floor(z / 2880);
  if (hint && !shoreOnly) {
    const y = hintedGroundHeight(hint, x, z, gridX, gridZ);
    if (y !== null) return y;
    hint.mesh = null;
  }
  const meshes = TERRAIN_MESH_GRID.get(`${gridX},${gridZ}`) || [];
  for (let i = meshes.length - 1; i >= 0; i--) {
    const m = meshes[i];
    if (x < m.minX || x > m.maxX || z < m.minZ || z > m.maxZ) continue;
    const x0 = m.minX + Math.min(Math.floor((x - m.minX) / m.stepX), Math.round((m.maxX - m.minX) / m.stepX) - 1) * m.stepX;
    const z0 = m.minZ + Math.min(Math.floor((z - m.minZ) / m.stepZ), Math.round((m.maxZ - m.minZ) / m.stepZ) - 1) * m.stepZ;
    const u = (x - x0) / m.stepX, v = (z - z0) / m.stepZ, upper = u + v <= 1;
    const cx = x0 + m.stepX * (upper ? 1 / 3 : 2 / 3), cz = z0 + m.stepZ * (upper ? 1 / 3 : 2 / 3);
    if (m.holes.some((h) => cx > h.minX && cx < h.maxX && cz > h.minZ && cz < h.maxZ)) continue;
    const faces = terrainShoreFaces(m, Math.round((x0 - m.minX) / m.stepX), Math.round((z0 - m.minZ) / m.stepZ), upper ? 0 : 1);
    if (faces) {
      for (const face of faces) {
        const y = shoreFaceHeight(face, x, z);
        if (y !== null) return y;
      }
      return waterAt(x, z)?.y ?? groundMeshHeight(x, z);
    }
    if (shoreOnly) return null;
    const a = terrainVertexHeight(m, x0 + m.stepX, z0), b = terrainVertexHeight(m, x0, z0 + m.stepZ);
    const c = upper ? terrainVertexHeight(m, x0, z0) : terrainVertexHeight(m, x0 + m.stepX, z0 + m.stepZ);
    if (hint) {
      hint.mesh = m; hint.meshes = meshes; hint.index = i; hint.gridX = gridX; hint.gridZ = gridZ;
      hint.x0 = x0; hint.z0 = z0; hint.upper = upper; hint.a = a; hint.b = b; hint.c = c;
    }
    return upper ? c * (1 - u - v) + a * u + b * v : c * (u + v - 1) + a * (1 - v) + b * (1 - u);
  }
  return shoreOnly ? null : groundMeshHeight(x, z);
}

/** Split a convex road ribbon along the visible terrain facets, preserving its interpolated UV coordinates. */
export function projectGroundPolygon(polygon, append) {
  const bounds = polygonBounds(polygon);
  const minX = Math.floor(bounds.minX / 2880), maxX = Math.floor(bounds.maxX / 2880);
  const minZ = Math.floor(bounds.minZ / 2880), maxZ = Math.floor(bounds.maxZ / 2880);
  let candidates;
  if (minX === maxX && minZ === maxZ) candidates = TERRAIN_MESH_GRID.get(`${minX},${minZ}`) || [];
  else {
    const meshes = new Set();
    for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
      for (const mesh of TERRAIN_MESH_GRID.get(`${x},${z}`) || []) meshes.add(mesh);
    }
    candidates = [...meshes].sort((a, b) => terrainOrder.get(a) - terrainOrder.get(b));
  }
  let remaining = [{ points: polygon, bounds }];
  for (let i = candidates.length - 1; i >= 0; i--) {
    if (!remaining.length) break;
    const mesh = candidates[i];
    const next = [];
    for (const entry of remaining) {
      const piece = entry.points, b = entry.bounds;
      if (b.maxX <= mesh.minX || b.minX >= mesh.maxX || b.maxZ <= mesh.minZ || b.minZ >= mesh.maxZ) {
        next.push(entry);
        continue;
      }
      let inside = piece;
      if (b.minX < mesh.minX || b.maxX > mesh.maxX || b.minZ < mesh.minZ || b.maxZ > mesh.maxZ) {
        for (const [x, z, limit] of [[1, 0, mesh.minX], [-1, 0, -mesh.maxX], [0, 1, mesh.minZ], [0, -1, -mesh.maxZ]]) {
          const outside = clipGroundPolygon(inside, -x, -z, -limit);
          if (outside.length >= 3) next.push({ points: outside, bounds: polygonBounds(outside) });
          inside = clipGroundPolygon(inside, x, z, limit);
          if (inside.length < 3) break;
        }
      }
      if (inside.length < 3) continue;
      const clipped = inside === piece ? b : polygonBounds(inside);
      const col0 = Math.max(0, Math.floor((clipped.minX - mesh.minX) / mesh.stepX));
      const col1 = Math.min(mesh.cols - 1, Math.floor((clipped.maxX - mesh.minX) / mesh.stepX));
      const row0 = Math.max(0, Math.floor((clipped.minZ - mesh.minZ) / mesh.stepZ));
      const row1 = Math.min(mesh.rows - 1, Math.floor((clipped.maxZ - mesh.minZ) / mesh.stepZ));
      for (let col = col0; col <= col1; col++) for (let row = row0; row <= row1; row++) {
        const x0 = mesh.minX + col * mesh.stepX, z0 = mesh.minZ + row * mesh.stepZ;
        const x1 = x0 + mesh.stepX, z1 = z0 + mesh.stepZ;
        let cell = clipGroundPolygon(inside, 1, 0, x0);
        cell = clipGroundPolygon(cell, -1, 0, -x1);
        cell = clipGroundPolygon(cell, 0, 1, z0);
        cell = clipGroundPolygon(cell, 0, -1, -z1);
        if (cell.length < 3) continue;
        const cx = x0 + mesh.stepX / 3, cz = z0 + mesh.stepZ / 3;
        const dx = x0 + mesh.stepX * 2 / 3, dz = z0 + mesh.stepZ * 2 / 3;
        const lowerHole = mesh.holes.some((h) => cx > h.minX && cx < h.maxX && cz > h.minZ && cz < h.maxZ);
        const upperHole = mesh.holes.some((h) => dx > h.minX && dx < h.maxX && dz > h.minZ && dz < h.maxZ);
        if (lowerHole && upperHole) {
          next.push({ points: cell, bounds: polygonBounds(cell) });
          continue;
        }
        const a = terrainVertexHeight(mesh, x1, z0), b = terrainVertexHeight(mesh, x0, z1);
        const c = terrainVertexHeight(mesh, x0, z0), d = terrainVertexHeight(mesh, x1, z1);
        const shore = [terrainShoreFaces(mesh, col, row, 0), terrainShoreFaces(mesh, col, row, 1)];
        if (!shore[0] && !shore[1] && !lowerHole && !upperHole && Math.abs(a + b - c - d) < 1e-8) {
          for (const point of cell) point[4] = c + (a - c) * (point[0] - x0) / mesh.stepX + (b - c) * (point[1] - z0) / mesh.stepZ;
          appendGroundFace(cell, append);
          continue;
        }
        const diagonal = x0 / mesh.stepX + z0 / mesh.stepZ + 1;
        for (let upper = 0; upper < 2; upper++) {
          const face = clipGroundPolygon(cell, (upper ? 1 : -1) / mesh.stepX, (upper ? 1 : -1) / mesh.stepZ, upper ? diagonal : -diagonal);
          if (face.length < 3) continue;
          if (upper ? upperHole : lowerHole) {
            next.push({ points: face, bounds: polygonBounds(face) });
            continue;
          }
          for (const point of face) {
            const u = (point[0] - x0) / mesh.stepX, v = (point[1] - z0) / mesh.stepZ;
            point[4] = upper ? d * (u + v - 1) + a * (1 - v) + b * (1 - u) : c * (1 - u - v) + a * u + b * v;
          }
          if (!shore[upper]) appendGroundFace(face, append);
          else for (const triangle of shore[upper]) {
            let part = face;
            for (let j = 0; j < 3 && part.length >= 3; j++) {
              const a = triangle[j], b = triangle[(j + 1) % 3];
              const nx = a[1] - b[1], nz = b[0] - a[0];
              part = clipGroundPolygon(part, nx, nz, nx * a[0] + nz * a[1]);
            }
            if (part.length < 3) continue;
            for (const point of part) point[4] = shoreFaceHeight(triangle, point[0], point[1]);
            appendGroundFace(part, append);
          }
        }
      }
    }
    remaining = next;
  }
  for (const { points: face } of remaining) {
    for (const point of face) point[4] = groundMeshHeight(point[0], point[1]);
    appendGroundFace(face, append);
  }
}

function appendGroundFace(face, append) {
  let unique = null;
  for (let i = 0; i < face.length; i++) {
    const p = face[i], previous = face[(i + face.length - 1) % face.length];
    if ((p[0] - previous[0]) ** 2 + (p[1] - previous[1]) ** 2 < 1e-16) {
      if (!unique) unique = face.slice(0, i);
    } else if (unique) unique.push(p);
  }
  if (unique) face = unique;
  if (face.length < 3) return;
  let retained = null;
  for (let i = 0; i < face.length; i++) {
    const previous = face[(i + face.length - 1) % face.length], p = face[i], next = face[(i + 1) % face.length];
    const area = Math.abs((p[0] - previous[0]) * (next[1] - p[1]) - (p[1] - previous[1]) * (next[0] - p[0]));
    if (area <= 1e-8) { if (!retained) retained = face.slice(0, i); }
    else if (retained) retained.push(p);
  }
  if (!retained) append(face);
  else if (retained.length >= 3) append(retained);
}

function polygonBounds(points) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point[0]); maxX = Math.max(maxX, point[0]);
    minZ = Math.min(minZ, point[1]); maxZ = Math.max(maxZ, point[1]);
  }
  return { minX, maxX, minZ, maxZ };
}

function clipGroundPolygon(points, x, z, limit) {
  if (points.length < 3) return [];
  let positive = 0;
  for (const point of points) if (point[0] * x + point[1] * z >= limit) positive++;
  if (positive === points.length) return points;
  if (positive === 0) return [];
  const result = [];
  let previous = points[points.length - 1], before = previous[0] * x + previous[1] * z - limit;
  for (const point of points) {
    const after = point[0] * x + point[1] * z - limit;
    if ((before >= 0) !== (after >= 0)) {
      const t = before / (before - after);
      result.push(previous.map((value, i) => value + (point[i] - value) * t));
    }
    if (after >= 0) result.push(point);
    previous = point; before = after;
  }
  return result;
}

function sampleRoadGrade(road, distance) {
  const samples = road.gradeSamples;
  let lo = 0, hi = samples.length / 2 - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (samples[mid * 2] < distance) lo = mid; else hi = mid; }
  const t = Math.max(0, Math.min(1, (distance - samples[lo * 2]) / (samples[hi * 2] - samples[lo * 2] || 1)));
  return samples[lo * 2 + 1] * (1 - t) + samples[hi * 2 + 1] * t;
}

/** A road's own deck remains continuous across lanes and never selects a crossing underneath it. */
export function roadHeight(road, x, z, terrainHint = null) {
  if (road?.pedestrianStructure && services.pedestrianRoadHeight) {
    const height = services.pedestrianRoadHeight(road, x, z);
    if (Number.isFinite(height)) return height;
  }
  if (road?.stepSegments) return stairHeight(road, x, z);
  if (!road?.gradeSamples) return renderedGroundHeight(x, z, false, terrainHint);
  return sampleRoadGrade(road, stationAt(road, x, z));
}

/** Visible treads and pedestrian foot heights use the same terrain-supported horizontal surfaces. */
function stairHeight(road, x, z) {
  let nearest = null, best = Infinity, position = null;
  for (const segment of road.stepSegments) {
    const p = project(segment, x, z);
    if (p.dist < best) { best = p.dist; nearest = segment; position = p; }
  }
  const { a, b, length, treadCount, treads } = nearest;
  if (!nearest.treadsPrepared) {
    const rise = Math.abs(renderedGroundHeight(a.x, a.z) - renderedGroundHeight(b.x, b.z));
    const count = road.stepCount ? Math.round(road.stepCount * length / road.length) : Math.round(rise / 0.15);
    nearest.treadCount = Math.min(treadCount, Math.max(1, count));
    nearest.treadsPrepared = true;
  }
  const count = nearest.treadCount, index = Math.min(count - 1, Math.floor(position.t * count));
  if (!treads.has(index)) {
    let top = -Infinity;
    const nx = (a.z - b.z) / length, nz = (b.x - a.x) / length;
    for (const t of [index / count, (index + 1) / count]) for (const side of [-1, 1]) {
      top = Math.max(top, renderedGroundHeight(a.x + (b.x - a.x) * t + nx * side * road.w / 2,
        a.z + (b.z - a.z) * t + nz * side * road.w / 2));
    }
    treads.set(index, top + 0.055);
  }
  return treads.get(index);
}

/** Open cuts and approach embankments meet the deck; covered tunnels retain their logical roof surface. */
export function groundSurfaceHeight(x, z) {
  const ground = terrainHeight(x, z);
  let lower = ground, upper = ground;
  for (const segment of GRADE_GRID.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) || []) {
    const road = segment.r;
    if (road.bridge || road.tunnel || road.covered || road.walk) continue;
    const p = project(segment, x, z), shoulder = road.w / 2 + 2.6;
    const surface = sampleRoadGrade(road, segment.start + p.t * segment.length);
    const slopeWidth = surface > ground ? Math.max(8, (surface - ground) * 1.8) : 8;
    if (p.dist > shoulder + slopeWidth) continue;
    const height = ground + (surface - ground) * Math.max(0, Math.min(1, (shoulder + slopeWidth - p.dist) / slopeWidth));
    lower = Math.min(lower, height); upper = Math.max(upper, height);
  }
  let height = lower < ground - 0.01 ? lower : upper;
  for (const site of CONSTRUCTION_GRID.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) || []) {
    if (!pointInPoly(site.poly, x, z) || site.holes.some((hole) => pointInPoly(hole, x, z))) continue;
    let edge = Infinity;
    for (let i = 0; i < site.poly.length; i++) edge = Math.min(edge, project({ a: site.poly[i], b: site.poly[(i + 1) % site.poly.length] }, x, z).dist);
    height = Math.min(height, ground + (site.floor - ground) * Math.min(1, edge / 3));
  }
  return height;
}

/** Terrain geometry follows the tunnel floor; the structural roof is rendered separately above it. */
export function groundMeshHeight(x, z) {
  let height = groundSurfaceHeight(x, z);
  for (const segment of GRADE_GRID.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) || []) {
    const road = segment.r;
    if (!road.tunnel || road.walk) continue;
    const p = project(segment, x, z), shoulder = road.w / 2 + 2.6;
    if (p.dist > shoulder + 4) continue;
    const floor = sampleRoadGrade(road, segment.start + p.t * segment.length);
    height = Math.min(height, height + (floor - height) * Math.max(0, Math.min(1, (shoulder + 4 - p.dist) / 4)));
  }
  return services.railwayGroundMeshHeight ? services.railwayGroundMeshHeight(x, z, height) : height;
}

/** Select the closest reachable surface for an entity; map arrivals can request the upper surface. */
export function surfaceHeight(x, z, referenceY) {
  let height = groundSurfaceHeight(x, z);
  const shore = renderedGroundHeight(x, z, true);
  if (shore !== null) height = shore;
  for (const segment of GRADE_GRID.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) || []) {
    const p = project(segment, x, z);
    const lateral = ((x - p.x) * (segment.a.z - segment.b.z) + (z - p.z) * (segment.b.x - segment.a.x)) / (segment.length || 1);
    const reach = segment.r.medianSide * lateral > 0 ? segment.r.medianReach : 0;
    if (p.dist >= Math.max(segment.r.w / 2 + 2.5, reach || 0)) continue;
    const candidate = sampleRoadGrade(segment.r, segment.start + p.t * segment.length);
    if (Number.isFinite(referenceY) ? Math.abs(candidate - referenceY) < Math.abs(height - referenceY) : candidate > height) height = candidate;
  }
  for (const segment of ROAD_GRID.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) || []) {
    if (!segment.treadCount || project(segment, x, z).dist > segment.r.w / 2) continue;
    const candidate = stairHeight(segment.r, x, z);
    if (Number.isFinite(referenceY) ? Math.abs(candidate - referenceY) < Math.abs(height - referenceY) : candidate > height) height = candidate;
  }
  if (services.campusSurfaceHeight) height = services.campusSurfaceHeight(x,z,referenceY,height);
  if (services.churchSurfaceHeight) height = services.churchSurfaceHeight(x,z,referenceY,height);
  if (services.aircraftSurfaceHeight) height = services.aircraftSurfaceHeight(x,z,referenceY,height);
  if (services.pedestrianSurfaceHeight) height = services.pedestrianSurfaceHeight(x,z,referenceY,height);
  return services.landmarkSurfaceHeight ? services.landmarkSurfaceHeight(x,z,referenceY,height) : height;
}

const helipadBuildings = new Map(), helipadBuildingIds = new Set((GEO.helipads || []).map((pad) => pad.building).filter(Boolean));
if (helipadBuildingIds.size) for (const building of GEO.buildings) {
  const key = `${building.osmType}/${building.id}`;
  if (!helipadBuildingIds.delete(key)) continue;
  helipadBuildings.set(key, building);
  if (!helipadBuildingIds.size) break;
}
export const HELIPADS = (GEO.helipads || []).map((p) => {
  const poly = toPoints(p.ring), building = helipadBuildings.get(p.building);
  const foundation = building ? Math.max(...toPoints(building.ring).map((v) => terrainHeight(v.x, v.z))) : terrainHeight(p.x, p.z);
  return { ...p, poly, ...boundsOf(poly), y: foundation + p.height };
});

/** A landing surface is usable only when the aircraft's full clearance fits inside its mapped edge. */
export function landingSurfaceAt(x, z, clearance = 0) {
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

export function waterAt(x, z) {
  return waterSystem.waterAt(x, z);
}

export function isOnLand(x, z) {
  if (x < ISLAND_BOUNDS.minX || x > ISLAND_BOUNDS.maxX || z < ISLAND_BOUNDS.minZ || z > ISLAND_BOUNDS.maxZ) return false;
  if (!waterAt(x, z)) return true;
  return nearestRoads(x, z, 30).some(({ road, dist }) => road.bridge && dist < road.w / 2 + 1);
}

export const BLOCKS = GEO.buildings.filter((b) => !b.part && b.fuelRole !== 'canopy' && !b.undergroundEntranceRoof).map((b) => {
  const bounds = boundsOf(b.ring);
  return createFootprint(b.ring, b.holes, { ...bounds, id: b.id, park: 0, parkName: '', median: false, rect: false,
    rects: [], frames: null, cx: (bounds.minX + bounds.maxX) / 2, cz: (bounds.minZ + bounds.maxZ) / 2 });
});
const BLOCK_GRID = new Map();
for (const b of BLOCKS) insert(BLOCK_GRID, b, b);

const PARKING_GRID = new Map();
for (const p of GEO.parkings || []) {
  const lot = { ...p, polygons: p.rings.map(toPoints), inner: p.holes.map(toPoints) };
  insert(PARKING_GRID, lot, p.bounds);
}

export function parkingAt(x, z) {
  for (const p of PARKING_GRID.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) || []) {
    if (p.polygons.some((ring) => pointInPoly(ring, x, z)) && !p.inner.some((ring) => pointInPoly(ring, x, z))) return p;
  }
  return null;
}

export function buildingAt(x, z) {
  for (const b of BLOCK_GRID.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) || []) {
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && pointInPoly(b.ring, x, z) && !b.sourceHoles.some((h) => pointInPoly(h, x, z))) return b;
  }
  return null;
}

export function blockAt(x, z) {
  const b = buildingAt(x, z);
  if (b) return b;
  const near = nearestRoads(x, z, 24).find(({ road }) => !road.walk);
  if (near && near.dist > near.road.w / 2 && near.dist < near.road.w / 2 + 4.5 && isOnLand(x, z)) return { park: 0, median: false };
  return null;
}

export function roadArrival(x, z) {
  for (const radius of [100, 250, 600, 1200]) {
    const near = nearestRoads(x, z, radius);
    for (const p of near) {
      if (p.road.walk || p.road.parking || buildingAt(p.x, p.z) || !isOnLand(p.x, p.z)) continue;
      return { x: p.x, z: p.z, y: roadHeight(p.road, p.x, p.z) + 0.07, heading: p.dist < 1 ? p.heading : Math.atan2(x - p.x, z - p.z) };
    }
  }
  return null;
}

export const TELEPORT_LOCATIONS = Object.fromEntries(['kremlin', 'kulsharif', 'bauman', 'palace', 'family', 'kaban', 'millennium', 'blacklake', 'taif', 'tatneft', 'makary', 'parkhouse', 'riviera', 'bahetle', 'kishmish', 'tandem', ...(GEO.coverage?.checkpoints || []).map((p) => p.id)].map((id) => {
  const target = NYC_LANDMARKS.find((l) => l.id === id);
  const arrival = roadArrival(target.entry?.x ?? target.x, target.entry?.z ?? target.z);
  if (!arrival) throw new Error(`No road arrival at ${target.name}`);
  return [id, arrival];
}));
const spawnRoad = nearestRoads(TELEPORT_LOCATIONS.kremlin.x, TELEPORT_LOCATIONS.kremlin.z, 30).find(({ road }) => !road.walk);
export const SPAWN = { ...TELEPORT_LOCATIONS.kremlin, heading: spawnRoad?.heading ?? TELEPORT_LOCATIONS.kremlin.heading };

export function getLocationLabel(x, z) {
  const landmark = NYC_LANDMARKS.find((l) => Math.hypot(l.x - x, l.z - z) < 85);
  if (landmark) return landmark.name;
  const water = waterAt(x, z);
  if (water) return water.name || 'Kazan waterfront';
  const near = nearestRoads(x, z, 100).filter(({ road }) => road.localName);
  if (near.length > 1 && near[1].dist < 24 && near[0].road.name !== near[1].road.name) return `${near[0].road.name} & ${near[1].road.name}`;
  return near[0]?.road.name || 'Kazan · Tatarstan';
}

export function isTypingInField(e) {
  return e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT');
}

export const SIGNAL_TIMING = { cycle: 60, avenueAmber: 26, avenueRed: 30, streetAmber: 56, walk: 7 };
export function signalPhase(time, isAvenue) {
  const t = ((time % 60) + 60) % 60;
  if (isAvenue) return t < 26 ? 'green' : t < 30 ? 'amber' : 'red';
  return t < 30 ? 'red' : t < 56 ? 'green' : 'amber';
}
export function walkSignal(time, isAvenue) {
  return (((time - (isAvenue ? 0 : 30)) % 60) + 60) % 60 < 7;
}


export const CENTRAL_PARK_BOUNDS = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };

export const AVENUES = [];

export const ALL_AVENUES = [];

export const STREETS = [];

export const ALL_STREETS = [];

export const getIslandBoundsAtZ = () => ({ westX: ISLAND_BOUNDS.minX, eastX: ISLAND_BOUNDS.maxX });
