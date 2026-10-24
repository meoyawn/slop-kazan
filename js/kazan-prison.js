import * as THREE from 'three/webgpu';
import { GEO } from './kazan-runtime.js';
import { toPoints, pointInPoly, terrainHeight, groundSurfaceHeight } from './kazan-config.js';

/** The mapped compound shares pale masonry, restrained barred bays and shallow roofs; its street portal follows reviewed photographs. */
export function createKazanPrisonModels(draw) {
  const { box, solid, shapeOf, splitExtrusion, pitchedRoof, plainMaterial, flush, buildingCollider } = draw;
  const white = plainMaterial(0xe5e5de), recess = plainMaterial(0xcbd0c8), stone = plainMaterial(0xb7bcb7);
  const roof = plainMaterial(0x6b5148), glass = plainMaterial(0x394746), iron = plainMaterial(0x9ba49d), gate = plainMaterial(0x7b8582);

  function faces(b) {
    const ps = toPoints(b.ring), result = [];
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i], b = ps[(i + 1) % ps.length], length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 0.5) continue;
      const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
      let nx = -(b.z - a.z) / length, nz = (b.x - a.x) / length;
      if (pointInPoly(ps, x + nx * 0.15, z + nz * 0.15)) { nx = -nx; nz = -nz; }
      result.push({ x, z, length, nx, nz, ux: nz, uz: -nx, yaw: Math.atan2(nx, nz) });
    }
    return result;
  }

  function point(f, u, y, v) {
    return new THREE.Vector3(f.x + f.ux * u + f.nx * v, y, f.z + f.uz * u + f.nz * v);
  }

  function panel(group, f, u, y, width, height, depth, projection, material) {
    const p = point(f, u, y, projection);
    box(group, p.x, p.y, p.z, width, height, depth, material, f.yaw);
  }

  function beam(group, a, b, width, depth, material) {
    const delta = b.clone().sub(a), length = delta.length();
    if (length < 0.01) return;
    const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), delta.divideScalar(length));
    box(group, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, length, width, depth, material, 0, orientation);
  }

  function windowBay(group, f, u, y, width, height) {
    panel(group, f, u, y, width + 0.16, height + 0.16, 0.07, 0.035, stone);
    panel(group, f, u, y, width, height, 0.08, 0.085, glass);
    for (const side of [-1, 1]) panel(group, f, u + side * width / 2, y, 0.055, height + 0.05, 0.08, 0.14, white);
    panel(group, f, u, y - height / 2, width + 0.17, 0.08, 0.21, 0.13, white);
    for (const side of [-0.3, 0, 0.3]) panel(group, f, u + side * width, y, 0.025, height, 0.035, 0.19, iron);
    for (const rise of [-0.27, 0.27]) panel(group, f, u, y + rise * height, width, 0.025, 0.035, 0.19, iron);
  }

  function streetFrame(b, boundaries) {
    return boundaries.filter((f) => f.length > 8).sort((a, c) => {
      const target = b.frontTowards;
      const da = target ? ((target[0] - a.x) * a.nx + (target[1] - a.z) * a.nz) / Math.hypot(target[0] - a.x, target[1] - a.z) : -a.nx;
      const dc = target ? ((target[0] - c.x) * c.nx + (target[1] - c.z) * c.nz) / Math.hypot(target[0] - c.x, target[1] - c.z) : -c.nx;
      return dc * Math.sqrt(c.length) - da * Math.sqrt(a.length);
    })[0];
  }

  function portal(group, f, base, wallHeight, totalHeight) {
    const radius = 1.85, spring = 1.4, s = new THREE.Shape();
    s.moveTo(-radius, 0); s.lineTo(radius, 0); s.lineTo(radius, spring);
    s.absarc(0, spring, radius, 0, Math.PI, false); s.closePath();
    const leaf = new THREE.ShapeGeometry(s, 20); leaf.rotateY(f.yaw);
    const p = point(f, 0, base + 0.03, 0.22); solid(group, leaf, gate, p.x, p.y, p.z);
    panel(group, f, 0, base + 1.3, 0.035, 2.6, 0.04, 0.255, iron);
    for (const side of [-1, 1]) panel(group, f, side * (radius + 0.18), base + spring / 2, 0.36, spring, 0.34, 0.18, white);
    for (let i = 0; i < 11; i++) {
      const a = i * Math.PI / 11 + 0.025, b = (i + 1) * Math.PI / 11 - 0.025, block = new THREE.Shape();
      block.moveTo(Math.cos(a) * radius, spring + Math.sin(a) * radius);
      block.lineTo(Math.cos(b) * radius, spring + Math.sin(b) * radius);
      block.lineTo(Math.cos(b) * (radius + 0.48), spring + Math.sin(b) * (radius + 0.48));
      block.lineTo(Math.cos(a) * (radius + 0.48), spring + Math.sin(a) * (radius + 0.48)); block.closePath();
      const g = new THREE.ExtrudeGeometry(block, { depth: 0.23, bevelEnabled: false }); g.rotateY(f.yaw);
      const q = point(f, 0, base, 0.11); solid(group, g, white, q.x, q.y, q.z);
    }
    const half = Math.min(8.5, f.length * 0.23), rise = totalHeight - wallHeight - 0.15;
    const pediment = new THREE.Shape(); pediment.moveTo(-half, 0); pediment.lineTo(half, 0); pediment.lineTo(0, rise); pediment.closePath();
    const gable = new THREE.ExtrudeGeometry(pediment, { depth: 7, bevelEnabled: false });
    gable.translate(0, 0, -7).rotateY(f.yaw);
    const q = point(f, 0, base + wallHeight, 0.05);
    gable.translate(q.x, q.y, q.z); splitExtrusion(group, gable, recess, roof, base);
    for (const side of [-1, 1]) beam(group, point(f, side * half, base + wallHeight, 0.25),
      point(f, 0, base + totalHeight - 0.1, 0.25), 0.17, 0.3, roof);
    panel(group, f, 0, base + wallHeight + 0.02, half * 2 + 0.25, 0.2, 0.37, 0.2, white);
    for (const u of [-6.5, -4.4, -2.2, 0, 2.2, 4.4, 6.5]) {
      const top = rise * (1 - Math.abs(u) / half) - 0.13;
      if (top <= 0.2) continue;
      beam(group, point(f, u * 0.7, base + wallHeight + 0.18, 0.2), point(f, u, base + wallHeight + top, 0.2), 0.24, 0.12, white);
    }
    panel(group, f, -6.1, base + 1.1, 0.9, 2.2, 0.06, 0.075, roof);
    const canopy = point(f, -5.5, base + 2.6, 1.05);
    box(group, canopy.x, canopy.y, canopy.z, 4.6, 0.1, 1.9, roof, f.yaw);
    for (const u of [-7.7, -3.3]) {
      const post = point(f, u, 0, 1.85), floor = groundSurfaceHeight(post.x, post.z);
      box(group, post.x, (floor + base + 2.6) / 2, post.z, 0.07, Math.max(0.1, base + 2.6 - floor), 0.07, gate);
    }
  }

  function emitBuilding(group, b, base) {
    if (b.model !== 'prison-classical') return false;
    const main = b.id === 415785176, northern = b.id === 415785175;
    const roofHeight = b.roofHeight || 0.8, wallHeight = b.h - roofHeight, boundaries = faces(b), front = streetFrame(b, boundaries);
    const body = new THREE.ExtrudeGeometry(shapeOf(b.ring, b.holes), { depth: wallHeight - b.minHeight, bevelEnabled: false });
    body.rotateX(-Math.PI / 2).translate(0, base + b.minHeight, 0); splitExtrusion(group, body, roof, white, base);
    const capHeight = main ? 1 : roofHeight;
    pitchedRoof(group, { ring: b.ring, holes: b.holes, h: wallHeight + capHeight, roofShape: 'hipped' }, base, capHeight, roof);
    const levels = b.levels || Math.max(1, Math.round(wallHeight / 3.1));
    for (const f of boundaries) {
      const ground = terrainHeight(f.x, f.z), bottom = Math.min(base, ground);
      panel(group, f, 0, (bottom + base + 0.8) / 2, f.length, base + 0.8 - bottom, 0.1, 0.06, stone);
      panel(group, f, 0, base + wallHeight - 0.08, f.length + 0.18, 0.2, 0.3, 0.1, white);
      const count = Math.max(1, Math.floor((f.length - 0.7) / 5));
      if (f.length < 2.7) continue;
      for (let row = 0; row < levels; row++) for (let col = 0; col < count; col++) {
        const u = (col + 0.5) * f.length / count - f.length / 2;
        if (main && f === front && !row && (Math.abs(u) < 2.5 || Math.abs(u + 6.1) < 1.2)) continue;
        const width = main && f === front && row && Math.abs(u) < 0.3 ? 1.45 : Math.min(1.05, f.length / count * 0.4);
        const height = Math.min(1.5, (wallHeight - 0.8) / levels * 0.55);
        windowBay(group, f, u, base + 0.8 + (row + 0.5) * (wallHeight - 0.8) / levels, width, height);
      }
    }
    if (main && front) portal(group, front, base, wallHeight, b.h);
    if (northern && front) {
      for (const rise of [0, 0.22, 0.44]) panel(group, front, 0, base + wallHeight + rise, front.length + 0.4, 0.16, 0.45, 0.17, white);
      for (let u = -front.length / 2 + 0.4; u < front.length / 2; u += 0.9) panel(group, front, u, base + wallHeight - 0.35, 0.27, 0.4, 0.4, 0.18, white);
    }
    return true;
  }

  function buildGrounds(parent) {
    const colliders = [];
    for (const site of GEO.prisonSites || []) {
      const group = new THREE.Group(); group.name = `KazanPrison/${site.id}`;
      const bodies = GEO.buildings.filter((b) => site.bodies.includes(`${b.osmType}/${b.id}`));
      const boundaries = bodies.flatMap(faces), ps = toPoints(site.boundary);
      for (let i = 0; i < ps.length; i++) {
        const a = ps[i], b = ps[(i + 1) % ps.length], length = Math.hypot(b.x - a.x, b.z - a.z), count = Math.ceil(length / 2);
        if (!count) continue;
        const ux = (b.x - a.x) / length, uz = (b.z - a.z) / length;
        for (let j = 0; j < count; j++) {
          const x = a.x + (b.x - a.x) * (j + 0.5) / count, z = a.z + (b.z - a.z) * (j + 0.5) / count;
          if (bodies.some((body) => pointInPoly(toPoints(body.ring), x, z))) continue;
          if (boundaries.some((f) => Math.abs(f.ux * ux + f.uz * uz) > 0.94 && Math.abs((x - f.x) * f.ux + (z - f.z) * f.uz) < f.length / 2 &&
            Math.abs((x - f.x) * f.nx + (z - f.z) * f.nz) < 4)) continue;
          if (site.gates.some((g) => Math.hypot(x - g.x, z - g.z) < 1.8)) continue;
          const y = groundSurfaceHeight(x, z), w = length / count + 0.04, h = 2.8;
          box(group, x, y + h / 2, z, w, h, 0.25, white, -Math.atan2(uz, ux));
          box(group, x, y + h, z, w + 0.04, 0.1, 0.35, stone, -Math.atan2(uz, ux));
          const ring = [-1, 1].flatMap((s) => [-1, 1].map((t) => [x + ux * s * w / 2 - uz * t * 0.125, z + uz * s * w / 2 + ux * t * 0.125]));
          const ordered = [ring[0], ring[2], ring[3], ring[1]].flat();
          colliders.push(buildingCollider({ ring: ordered, holes: [], h, minHeight: 0 }, y));
        }
      }
      flush(group); parent.add(group);
    }
    return colliders;
  }
  return { emitBuilding, buildGrounds };
}
