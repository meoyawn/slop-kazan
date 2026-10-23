import * as THREE from 'three/webgpu';
import { ROADS, roadHeight, terrainHeight, groundSurfaceHeight, nearestRoads } from './kazan-config.js';
import { runtime } from './kazan-runtime.js';
import { tramCorridorAt, nearestTram } from './kazan-trams.js';

/** Shared bridge decks, supports and tunnel portals follow the same profiles as road traffic. */
export function createKazanRoadStructures(draw) {
  const { plainMaterial, box, emit, flush } = draw;
  const group = new THREE.Group(); group.name = 'KazanRoadStructures';
  const decks = new THREE.Group(); decks.name = 'KazanBridgeDecks';
  const supports = new THREE.Group(); supports.name = 'KazanBridgeSupports';
  const tunnels = new THREE.Group(); tunnels.name = 'KazanTunnelStructures';
  group.add(decks, supports, tunnels);
  const concrete = plainMaterial(0x9fa5a1), pale = plainMaterial(0xc0c4bf), steel = plainMaterial(0x727e80, 0.35);
  const dark = plainMaterial(0x59615e), colliders = [], pairs = new Map();
  const bridges = ROADS.filter((r) => r.bridge && !r.walk && r.length > 8);
  const spacing = runtime?.lite ? 12 : 8;
  const light = new THREE.MeshStandardNodeMaterial({ color: 0xd7d5b7, emissive: 0xf0ddad, emissiveIntensity: 0.65, roughness: 0.8 });

  function at(road, station) {
    const s = Math.max(0, Math.min(road.length, station));
    let i = 1;
    while (i < road.distances.length - 1 && road.distances[i] < s) i++;
    const a = road.pts[i - 1], b = road.pts[i], length = road.distances[i] - road.distances[i - 1] || 1;
    const t = (s - road.distances[i - 1]) / length;
    let dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
    if (t < 0.0001 && i > 1) {
      const p = road.pts[i - 2], previous = Math.hypot(a.x - p.x, a.z - p.z) || 1;
      dx += (a.x - p.x) / previous; dz += (a.z - p.z) / previous;
    } else if (t > 0.9999 && i + 1 < road.pts.length) {
      const p = road.pts[i + 1], next = Math.hypot(p.x - b.x, p.z - b.z) || 1;
      dx += (p.x - b.x) / next; dz += (p.z - b.z) / next;
    }
    const norm = Math.hypot(dx, dz) || 1, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    return { x, z, y: roadHeight(road, x, z), dx: dx / norm, dz: dz / norm, nx: -dz / norm, nz: dx / norm };
  }

  function stations(road) {
    const result = [at(road, 0)];
    for (let i = 1; i < road.pts.length; i++) {
      const start = road.distances[i - 1], length = road.distances[i] - start, steps = Math.max(1, Math.ceil(length / spacing));
      for (let j = 1; j <= steps; j++) result.push(at(road, start + length * j / steps));
    }
    return result;
  }

  function prism(target, top, bottom, material) {
    const points = [...top, ...top.map(([x, , z], i) => [x, bottom[i], z])], position = [], uv = [];
    for (const face of [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]) {
      for (const j of [0, 1, 2, 0, 2, 3]) {
        const p = points[face[j]]; position.push(...p); uv.push(p[0] + p[2], p[1]);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals(); emit(target, geometry, material);
  }

  function ribbon(target, points, width, offset, height, depth, material) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const top = [[a.x + a.nx * (offset - width / 2), a.y + height, a.z + a.nz * (offset - width / 2)],
        [a.x + a.nx * (offset + width / 2), a.y + height, a.z + a.nz * (offset + width / 2)],
        [b.x + b.nx * (offset + width / 2), b.y + height, b.z + b.nz * (offset + width / 2)],
        [b.x + b.nx * (offset - width / 2), b.y + height, b.z + b.nz * (offset - width / 2)]];
      prism(target, top, top.map((p) => p[1] - depth), material);
    }
  }

  for (const road of bridges) {
    if (pairs.has(road)) continue;
    const a = road.pts[0], b = road.pts.at(-1), range = road.w / 2 + 18;
    let best = null;
    for (const other of bridges) {
      if (other === road || pairs.has(other) || other.layer !== road.layer || other.name !== road.name ||
        other.length < road.length * 0.75 || other.length > road.length * 1.33) continue;
      const c = other.pts[0], d = other.pts.at(-1);
      const forward = Math.hypot(a.x - c.x, a.z - c.z) + Math.hypot(b.x - d.x, b.z - d.z);
      const reverse = Math.hypot(a.x - d.x, a.z - d.z) + Math.hypot(b.x - c.x, b.z - c.z);
      const score = Math.min(forward, reverse), flipped = reverse < forward;
      const mid = at(road, road.length / 2), next = at(other, other.length / 2), distance = Math.hypot(mid.x - next.x, mid.z - next.z);
      if (score > range * 2 || distance < 1 || distance > (road.w + other.w) / 2 + 12 ||
        Math.abs(mid.dx * next.dx + mid.dz * next.dz) < 0.97 || Math.abs(mid.y - next.y) > 1.5) continue;
      if (!best || score < best.score) best = { other, flipped, score };
    }
    if (best) { pairs.set(road, best); pairs.set(best.other, { other: road, flipped: best.flipped, score: best.score }); }
  }

  function railing(target, points, offset) {
    ribbon(target, points, 0.32, offset, 0.24, 0.24, pale);
    for (const height of [0.65, 1.08]) ribbon(target, points, 0.09, offset, height, 0.08, steel);
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      box(target, p.x + p.nx * offset, p.y + 0.65, p.z + p.nz * offset, 0.08, 0.92, 0.08, steel);
    }
  }

  function freeSupport(road, p, x, z) {
    const ground = groundSurfaceHeight(x, z);
    if (p.y - ground < 2.2) return false;
    const tram = tramCorridorAt?.(x, z, 1.2) ? nearestTram(x, z, null, { minY: ground - 4, maxY: p.y }) : null;
    if (tram && tram.distance < 3.5) return false;
    return !nearestRoads(x, z, 24).some((q) => q.road !== road &&
      q.dist < q.road.w / 2 + 1.6 && roadHeight(q.road, q.x, q.z) > ground - 1 && roadHeight(q.road, q.x, q.z) < p.y - 1.5);
  }

  function pier(road, station) {
    for (const shift of [0, 6, -6, 12, -12]) {
      const s = station + shift;
      if (s < 8 || s > road.length - 8) continue;
      const p = at(road, s), candidates = [0, -(road.w / 2 + 0.4), road.w / 2 + 0.4];
      const legs = candidates.filter((o) => freeSupport(road, p, p.x + p.nx * o, p.z + p.nz * o));
      if (!legs.length) continue;
      const chosen = legs[0] === 0 ? [0] : legs;
      for (const offset of chosen) {
        const x = p.x + p.nx * offset, z = p.z + p.nz * offset;
        const bottom = Math.min(terrainHeight(x, z), groundSurfaceHeight(x, z)) - 0.35, top = p.y - 0.9;
        const width = road.w > 10 ? 1.5 : 1.15;
        box(supports, x, (bottom + top) / 2, z, width, top - bottom, 1.35, concrete, -Math.atan2(p.dz, p.dx));
        box(supports, x, bottom + 0.25, z, width + 0.7, 0.5, 2, dark, -Math.atan2(p.dz, p.dx));
        colliders.push({ minX: x - 0.9, maxX: x + 0.9, minZ: z - 0.9, maxZ: z + 0.9, minY: bottom, maxY: top });
      }
      box(supports, p.x, p.y - 1, p.z, road.w + 2, 0.75, 1.5, concrete, -Math.atan2(p.dz, p.dx));
      return;
    }
  }

  const joined = new Set();
  for (const road of bridges) {
    const points = stations(road), pair = pairs.get(road);
    ribbon(decks, points, road.w + 2.2, 0, 0.035, 0.9, concrete);
    let inner = 0;
    if (pair) {
      const p = at(road, road.length / 2), q = at(pair.other, pair.other.length / 2);
      inner = Math.sign((q.x - p.x) * p.nx + (q.z - p.z) * p.nz);
      road.medianSide = inner;
      road.medianReach = Math.max(road.w / 2 + 2.5, Math.hypot(q.x - p.x, q.z - p.z) / 2 + 0.25);
      if (!joined.has(road)) {
        const median = [];
        for (let i = 0; i < points.length; i++) {
          const t = road.length ? i / (points.length - 1) : 0, a = at(road, t * road.length);
          const b = at(pair.other, (pair.flipped ? 1 - t : t) * pair.other.length);
          median.push({ ...a, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, y: (a.y + b.y) / 2 });
          if (!i) continue;
          const u = at(road, (i - 1) / (points.length - 1) * road.length), v = at(pair.other, (pair.flipped ? 1 - (i - 1) / (points.length - 1) : (i - 1) / (points.length - 1)) * pair.other.length);
          const top = [[u.x, u.y + 0.035, u.z], [v.x, v.y + 0.035, v.z], [b.x, b.y + 0.035, b.z], [a.x, a.y + 0.035, a.z]];
          prism(decks, top, top.map((p) => p[1] - 0.9), concrete);
        }
        ribbon(decks, median, 0.42, 0, 0.78, 0.74, pale);
        joined.add(road); joined.add(pair.other);
      }
    }
    for (const side of [-1, 1]) if (side !== inner) railing(decks, points, side * (road.w / 2 + 0.85));
    const count = Math.max(1, Math.floor(road.length / (road.length > 350 ? 60 : 30)));
    for (let i = 0; i < count; i++) pier(road, road.length * (i + 0.5) / count);
  }

  for (const road of ROADS) {
    if (road.walk || road.bridge || !road.gradeSamples) continue;
    const points = stations(road), underground = road.tunnel;
    const sharedTram = underground && points.some((p) => {
      if (!tramCorridorAt?.(p.x, p.z, road.w / 2 + 3.1)) return false;
      const tram = nearestTram?.(p.x, p.z, null, { minY: p.y - 1, maxY: p.y + 1 });
      return tram?.track.tunnel && tram.distance < road.w / 2 + 5.5 && tram.track.layer === road.layer;
    });
    const clearance = sharedTram ? 6.9 : 5.3;
    if (underground) {
      const roof = points.map((p) => ({ ...p, y: Math.max(p.y + clearance, terrainHeight(p.x, p.z) - 0.08) }));
      ribbon(tunnels, roof, road.w + 5.2, 0, 0, 0.55, concrete);
      for (const p of [points[0], points.at(-1)]) {
        box(tunnels, p.x, p.y + clearance + 0.13, p.z, road.w + 5.8, 0.8, 0.85, pale, -Math.atan2(p.dz, p.dx));
      }
    }
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], p = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, y: (a.y + b.y) / 2 };
      const depth = terrainHeight(p.x, p.z) - p.y;
      if (!underground && depth < 0.4) continue;
      const length = Math.hypot(b.x - a.x, b.z - a.z), yaw = -Math.atan2(b.z - a.z, b.x - a.x);
      for (const side of [-1, 1]) {
        const offset = side * (road.w / 2 + 2.3), x = p.x + a.nx * offset, z = p.z + a.nz * offset;
        const top = underground ? Math.max(p.y + clearance - 0.1, terrainHeight(x, z) - 0.15) : terrainHeight(x, z) + 0.25;
        const tram = tramCorridorAt?.(x, z, -0.3) ? nearestTram(x, z, null, { minY: p.y - 3.6, maxY: top }) : null;
        if (tram && tram.distance < 2.1) continue;
        box(tunnels, x, (p.y + top) / 2, z, length + 0.05, top - p.y + 0.2, 0.55, concrete, yaw);
        box(tunnels, x - side * a.nx * 0.3, p.y + 0.35, z - side * a.nz * 0.3, length + 0.05, 0.55, 0.12, dark, yaw);
        if (!underground) box(tunnels, x, top + 0.43, z, length + 0.05, 0.75, 0.28, pale, yaw);
        else if (i % 2 === 0) box(tunnels, x - side * a.nx * 0.3, p.y + 4.6, z - side * a.nz * 0.3, 2, 0.1, 0.12, light, yaw);
      }
    }
  }
  for (const part of [decks, supports, tunnels]) flush(part);
  return { group, colliders };
}
