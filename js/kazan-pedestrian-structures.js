import * as THREE from 'three/webgpu';
import { GEO, services } from './kazan-runtime.js';
import { ROADS, SPAWN, groundSurfaceHeight, roadHeight, nearestRoads } from './kazan-config.js';
import { nearestRailway, railwayAt } from './kazan-railways.js';
import { tramCorridorAt, nearestTram } from './kazan-trams.js';
import { createPedestrianProfiles, pedestrianPathSample, samplePedestrianSegment } from './kazan-pedestrian-levels.js';

function railCrossingHeight(x, z, dx, dz, layer) {
  const nearby = [nearestRailway(x, z), nearestTram(x, z)];
  let height = -Infinity;
  for (const p of nearby) {
    if (!p || p.distance > 4 || p.track.tunnel || (p.track.layer || 0) >= layer || Math.abs(dx * p.dx + dz * p.dz) > 0.85) continue;
    height = Math.max(height, p.y);
  }
  return height;
}

const profiles = createPedestrianProfiles(GEO.pedestrianStructures?.structures || [], {
  groundHeight: groundSurfaceHeight, roads: ROADS, roadSurface: (index, x, z) => roadHeight(ROADS[index], x, z), railCrossingHeight
});
const byWay = new Map(), cells = new Map();
for (const s of profiles) for (const path of s.paths) {
  if (!byWay.has(path.id)) byWay.set(path.id, []);
  byWay.get(path.id).push(path);
  for (const segment of path.segments) {
    const { a, b } = segment, margin = path.width / 2 + 4;
    for (let x = Math.floor((Math.min(a.x, b.x) - margin) / 64); x <= Math.floor((Math.max(a.x, b.x) + margin) / 64); x++) {
      for (let z = Math.floor((Math.min(a.z, b.z) - margin) / 64); z <= Math.floor((Math.max(a.z, b.z) + margin) / 64); z++) {
        const key = `${x},${z}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push({ path, segment });
      }
    }
  }
}

function surfaceHeight(x, z, referenceY, height) {
  for (const { path, segment } of cells.get(`${Math.floor(x / 64)},${Math.floor(z / 64)}`) || []) {
    const { a, b, length } = segment, dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / length ** 2));
    if (Math.hypot(x - a.x - t * dx, z - a.z - t * dz) > path.width / 2 + 0.08) continue;
    const candidate = samplePedestrianSegment(segment, t) + 0.055;
    if (Number.isFinite(referenceY) ? Math.abs(candidate - referenceY) < Math.abs(height - referenceY) : candidate > height) height = candidate;
  }
  return height;
}

function pedestrianRoadHeight(road, x, z) {
  let sample = null;
  for (const p of byWay.get(road.id) || []) {
    const next = pedestrianPathSample(p, x, z);
    if (next && (!sample || next.distance < sample.distance)) sample = next;
  }
  return sample?.y;
}
services.pedestrianSurfaceHeight = surfaceHeight;
services.pedestrianRoadHeight = pedestrianRoadHeight;

/** Shared gray tubes, open rails and supported stair flights follow the mapped walking network. */
export function createKazanPedestrianStructures(draw) {
  const { plainMaterial, box, emit, flush, buildingCollider } = draw;
  const palette = GEO.pedestrianStructures?.appearance?.palette || {};
  const frame = plainMaterial(new THREE.Color(palette.frame || '#a9b2b3').getHex(), 0.3), roof = plainMaterial(new THREE.Color(palette.roof || '#bdc5c1').getHex());
  const glass = plainMaterial(new THREE.Color(palette.glass || '#9eafb2').getHex(), 0.1), concrete = plainMaterial(new THREE.Color(palette.concrete || '#a4a99e').getHex());
  const timber = plainMaterial(new THREE.Color(palette.wood || '#8b806a').getHex());

  function beam(group, a, b, width, depth, material) {
    const direction = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z), length = direction.length();
    if (length < 0.01) return;
    const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.divideScalar(length));
    box(group, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, width, length, depth, material, 0, orientation);
  }

  function prism(group, top, depth, material) {
    const points = top.concat(top.map((p, i) => [p[0], typeof depth === 'number' ? p[1] - depth : depth[i], p[2]])), position = [], uv = [];
    for (const face of [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]) {
      for (const j of [0, 1, 2, 0, 2, 3]) { const p = points[face[j]]; position.push(...p); uv.push(p[0] + p[2], p[1]); }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals(); emit(group, geometry, material);
  }

  function strip(group, a, b, nx, nz, lo, hi, ya, yb, depth, material) {
    prism(group, [[a.x + nx * lo, ya, a.z + nz * lo], [a.x + nx * hi, ya, a.z + nz * hi],
      [b.x + nx * hi, yb, b.z + nz * hi], [b.x + nx * lo, yb, b.z + nz * lo]], depth, material);
  }

  function collider(a, b, nx, nz, offset, width, bottom, top) {
    const ring = [a.x + nx * (offset - width / 2), a.z + nz * (offset - width / 2), b.x + nx * (offset - width / 2), b.z + nz * (offset - width / 2),
      b.x + nx * (offset + width / 2), b.z + nz * (offset + width / 2), a.x + nx * (offset + width / 2), a.z + nz * (offset + width / 2)];
    return { ...buildingCollider({ ring, holes: [], minHeight: 0, h: top - bottom }, bottom), minY: bottom, maxY: top };
  }

  function enclosureFloor(site, a, b, nx, nz, half) {
    let height = Math.max(a.y, b.y);
    for (const p of [a, b]) for (const side of [-1, 0, 1]) {
      const x = p.x + nx * side * (half + 0.2), z = p.z + nz * side * (half + 0.2);
      for (const path of site.paths) {
        const sample = pedestrianPathSample(path, x, z);
        if (sample && sample.distance < path.width / 2 + 0.4) height = Math.max(height, sample.y);
      }
    }
    return height > Math.max(a.y, b.y) + 0.2 ? height + 0.05 : null;
  }

  function build(parent, initialPosition = SPAWN) {
    const group = new THREE.Group(); group.name = 'KazanPedestrianStructures';
    const colliders = [], regions = new Map(), placedSupports = new Set();
    for (const site of profiles) {
      const ix = Math.floor(site.x / 2048), iz = Math.floor(site.z / 2048), key = `${ix},${iz}`;
      if (!regions.has(key)) {
        const tile = new THREE.Group(); tile.name = `KazanPedestrianRegion/${key}`;
        regions.set(key, { group: tile, minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity }); group.add(tile);
      }
      const region = regions.get(key), tile = region.group;
      const connections = new Map();
      for (const path of site.paths) for (const id of new Set(path.nodeIds)) connections.set(id, (connections.get(id) || 0) + 1);
      for (const path of site.paths) for (let i = 1; i + 1 < path.points.length; i++) {
        const a = path.points[i - 1], b = path.points[i], c = path.points[i + 1];
        const dx = b.x - a.x, dz = b.z - a.z, ex = c.x - b.x, ez = c.z - b.z, lengths = Math.hypot(dx, dz) * Math.hypot(ex, ez);
        if (lengths && (dx * ex + dz * ez) / lengths < 0.85) connections.set(b.id, 2);
      }
      for (const axis of ['X', 'Z']) { region[`min${axis}`] = Math.min(region[`min${axis}`], site.bounds[`min${axis}`] - 10); region[`max${axis}`] = Math.max(region[`max${axis}`], site.bounds[`max${axis}`] + 10); }
      for (const path of site.paths) for (const segment of path.segments) {
        const { a, b, length, treadCount } = segment, dx = (b.x - a.x) / length, dz = (b.z - a.z) / length, nx = -dz, nz = dx, half = path.width / 2;
        if (treadCount) {
          for (let i = 0; i < treadCount; i++) {
            const t = (i + 0.5) / treadCount, y = samplePedestrianSegment(segment, t) + 0.055;
            box(tile, a.x + (b.x - a.x) * t, y - 0.09, a.z + (b.z - a.z) * t, path.width, 0.18, length / treadCount + 0.012, concrete, -Math.atan2(dz, dx) - Math.PI / 2);
          }
          for (const side of [-1, 1]) beam(tile, { x: a.x + nx * side * (half - 0.15), y: a.y - 0.2, z: a.z + nz * side * (half - 0.15) },
            { x: b.x + nx * side * (half - 0.15), y: b.y - 0.2, z: b.z + nz * side * (half - 0.15) }, 0.18, 0.26, frame);
        } else strip(tile, a, b, nx, nz, -half, half, a.y + 0.055, b.y + 0.055, 0.35, site.kind === 'boardwalk' ? timber : concrete);
        const parts = Math.max(1, Math.ceil(length / 3), Math.ceil(Math.abs(b.y - a.y) / 0.35));
        for (let i = 0; i < parts; i++) {
          const u = i / parts, v = (i + 1) / parts;
          const start = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u };
          const end = { x: a.x + (b.x - a.x) * v, y: a.y + (b.y - a.y) * v, z: a.z + (b.z - a.z) * v };
          const opening = connections.get(a.id) > 1 && u * length < half + 0.4 || connections.get(b.id) > 1 && (1 - v) * length < half + 0.4;
          const enclosure = path.covered ? enclosureFloor(site, start, end, nx, nz, half) : null;
          const roofA = enclosure ?? start.y, roofB = enclosure ?? end.y;
          for (const side of [-1, 1]) {
            if (opening) continue;
            const offset = half * side, top = path.covered ? 2.4 : 1.15;
            const from = { x: start.x + nx * offset, y: start.y + 0.65, z: start.z + nz * offset };
            const to = { x: end.x + nx * offset, y: end.y + 0.65, z: end.z + nz * offset };
            for (const h of [0, 0.5]) beam(tile, { ...from, y: from.y + h }, { ...to, y: to.y + h }, 0.07, 0.07, frame);
            if (path.covered) {
              strip(tile, start, end, nx, nz, offset - 0.04, offset + 0.04, roofA + 2.35, roofB + 2.35, [start.y + 0.4, start.y + 0.4, end.y + 0.4, end.y + 0.4], glass);
              beam(tile, { ...from, y: roofA + 2.4 }, { ...to, y: roofB + 2.4 }, 0.1, 0.12, frame);
            }
            beam(tile, { ...from, y: start.y + 0.1 }, { ...from, y: (path.covered ? roofA : start.y) + top }, 0.09, 0.1, frame);
            colliders.push(collider(start, end, nx, nz, offset, 0.09, Math.min(start.y, end.y) + 0.15, Math.max(path.covered ? roofA : start.y, path.covered ? roofB : end.y) + top));
          }
          if (path.covered) {
            for (const side of [-1, 1]) {
              const lo = side < 0 ? -half - 0.15 : 0, hi = side < 0 ? 0 : half + 0.15;
              const points = [[start.x + nx * lo, roofA + (side < 0 ? 2.45 : 2.85), start.z + nz * lo],
                [start.x + nx * hi, roofA + (side < 0 ? 2.85 : 2.45), start.z + nz * hi],
                [end.x + nx * hi, roofB + (side < 0 ? 2.85 : 2.45), end.z + nz * hi],
                [end.x + nx * lo, roofB + (side < 0 ? 2.45 : 2.85), end.z + nz * lo]];
              prism(tile, points, 0.1, roof);
              beam(tile, { x: start.x + nx * side * (half + 0.1), y: roofA + 2.4, z: start.z + nz * side * (half + 0.1) }, { x: start.x, y: roofA + 2.85, z: start.z }, 0.09, 0.12, frame);
            }
            colliders.push(collider(start, end, nx, nz, 0, path.width + 0.3, Math.min(roofA, roofB) + 2.35, Math.max(roofA, roofB) + 2.9));
          }
        }
        if (path.role !== 'span' || site.kind === 'road-sidewalk') continue;
        const count = Math.max(1, Math.ceil(length / 30));
        for (let i = 0; i <= count; i++) for (const side of [-1, 1]) {
          const t = i / count, x = a.x + (b.x - a.x) * t + nx * side * (half + 0.75), z = a.z + (b.z - a.z) * t + nz * side * (half + 0.75);
          const bottom = groundSurfaceHeight(x, z), top = a.y + (b.y - a.y) * t - 0.15, key = `${Math.round(x)},${Math.round(z)}`;
          if (top - bottom < 1 || placedSupports.has(key) || railwayAt(x, z, 2) || tramCorridorAt(x, z, 2) || nearestRoads(x, z, 30).some((p) => !p.road.walk && p.dist < p.road.w / 2 + 2)) continue;
          if (site.paths.some((p) => pedestrianPathSample(p, x, z)?.distance < p.width / 2 + 0.4)) continue;
          placedSupports.add(key);
          box(tile, x, (bottom + top) / 2, z, 0.65, top - bottom, 0.65, concrete);
          box(tile, x, bottom + 0.15, z, 1, 0.3, 1, concrete);
          colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5, minY: bottom, maxY: top });
        }
      }
    }
    for (const site of profiles) {
      const region = regions.get(`${Math.floor(site.x / 2048)},${Math.floor(site.z / 2048)}`);
      for (const lift of site.lifts) {
        const path = site.paths.find((p) => p.points.some((n) => n.id === lift.id));
        if (!path) continue;
        const index = path.points.findIndex((n) => n.id === lift.id), n = path.points[index], other = path.points[index ? index - 1 : 1];
        if (!other) continue;
        const length = Math.hypot(n.x - other.x, n.z - other.z) || 1, dx = (n.x - other.x) / length, dz = (n.z - other.z) / length;
        const nx = -dz, nz = dx, bottom = groundSurfaceHeight(lift.x, lift.z), top = Math.max(bottom + 3, n.y + 2.9), yaw = Math.atan2(dx, dz);
        for (const side of [-1, 1]) {
          const a = { x: lift.x - dx * 0.55 + nx * side * 1.05, z: lift.z - dz * 0.55 + nz * side * 1.05 };
          const b = { x: lift.x + dx * 1.1 + nx * side * 1.05, z: lift.z + dz * 1.1 + nz * side * 1.05 };
          box(region.group, lift.x + dx * 0.275 + nx * side * 1.05, (bottom + top) / 2, lift.z + dz * 0.275 + nz * side * 1.05, 0.1, top - bottom, 1.65, glass, yaw);
          colliders.push(collider(a, b, nx, nz, 0, 0.1, bottom, top));
        }
        const a = { x: lift.x + dx * 1.1 - nx * 1.05, z: lift.z + dz * 1.1 - nz * 1.05 };
        const b = { x: lift.x + dx * 1.1 + nx * 1.05, z: lift.z + dz * 1.1 + nz * 1.05 };
        box(region.group, lift.x + dx * 1.1, (bottom + top) / 2, lift.z + dz * 1.1, 2.2, top - bottom, 0.1, glass, yaw);
        box(region.group, lift.x, top + 0.06, lift.z, 2.4, 0.12, 2.4, roof, yaw);
        colliders.push(collider(a, b, dx, dz, 0, 0.1, bottom, top));
      }
    }
    for (const region of regions.values()) flush(region.group);
    let cell = '';
    function update(x, z) {
      const key = `${Math.floor(x / 256)},${Math.floor(z / 256)}`;
      if (key === cell) return;
      cell = key;
      for (const r of regions.values()) r.group.visible = Math.hypot(Math.max(r.minX - x, x - r.maxX, 0), Math.max(r.minZ - z, z - r.maxZ, 0)) < 2400;
    }
    update(initialPosition.x, initialPosition.z); parent.add(group);
    return { colliders, update };
  }
  return { build };
}
