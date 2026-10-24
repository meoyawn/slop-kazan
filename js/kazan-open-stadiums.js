import * as THREE from 'three/webgpu';
import { GEO } from './kazan-runtime.js';
import { toPoints, pointInPoly, terrainHeight } from './kazan-config.js';

const keyOf = (b) => `${b.osmType}/${b.id}`;

/** Open stadiums share a mapped annular canopy, seating bands, pitch and accessible podium rather than a solid arena cap. */
export function createKazanOpenStadiums(draw) {
  const { plainMaterial, box, emit, shapeOf, splitExtrusion, label } = draw;
  const buildings = new Map(GEO.buildings.map((b) => [keyOf(b), b]));
  const appearances = new Map((GEO.sports?.bindings || []).filter((b) => b.appearance?.family === 'open-stadium').map((b) => [b.reference, b.appearance]));
  const cache = new Map(), samples = 96;
  const green = plainMaterial(0x277b65), white = plainMaterial(0xd7dfd9), metal = plainMaterial(0xa4b4b2, 0.3);
  const glazing = plainMaterial(0x263e43, 0.22), dark = plainMaterial(0x273435), deck = plainMaterial(0x777f80);
  const red = plainMaterial(0x9c373b), redDark = plainMaterial(0x712e34), grass = plainMaterial(0x4d7947), stripe = plainMaterial(0x527e4b);

  function ray(ring, cx, cz, dx, dz) {
    let nearest = Infinity;
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const ax = ring[j] - cx, az = ring[j + 1] - cz, ex = ring[i] - ring[j], ez = ring[i + 1] - ring[j + 1];
      const denominator = dx * ez - dz * ex;
      if (Math.abs(denominator) < 1e-8) continue;
      const d = (ax * ez - az * ex) / denominator, t = (ax * dz - az * dx) / denominator;
      if (d > 0 && t >= -1e-6 && t <= 1 + 1e-6) nearest = Math.min(nearest, d);
    }
    return Number.isFinite(nearest) ? nearest : null;
  }

  function layout(b) {
    if (cache.has(b)) return cache.get(b);
    const appearance = appearances.get(keyOf(b));
    if (!appearance || keyOf(b) !== appearance.main) return null;
    const roof = buildings.get(appearance.roof), podium = buildings.get(appearance.podium);
    const field = GEO.sports.features.find((f) => f.reference === appearance.field), ring = field?.rings[0];
    if (!roof?.holes.length || !podium || !ring) return null;
    const pts = toPoints(ring), cx = pts.reduce((n, p) => n + p.x, 0) / pts.length, cz = pts.reduce((n, p) => n + p.z, 0) / pts.length;
    let length = 0, ux = 0, uz = 1;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length], d = Math.hypot(c.x - a.x, c.z - a.z);
      if (d > length) { length = d; ux = (c.x - a.x) / d; uz = (c.z - a.z) / d; }
    }
    const base = b.foundationAt ? terrainHeight(...b.foundationAt) : Math.max(...toPoints(b.ring).map((p) => terrainHeight(p.x, p.z)));
    const result = { b, appearance, roof, podium, field, cx, cz, ux, uz, base, fieldY: base + 0.18, stairs: [] };
    for (const angle of appearance.stairAngles || []) {
      const dx = Math.cos(angle), dz = Math.sin(angle), distance = ray(podium.ring, cx, cz, dx, dz);
      if (distance === null) continue;
      const x = cx + dx * distance, z = cz + dz * distance;
      const ground = terrainHeight(x + dx * appearance.stairDepth, z + dz * appearance.stairDepth);
      const rise = base + podium.h - ground;
      if (rise <= 0 || rise > 5) continue;
      result.stairs.push({ x, z, nx: dx, nz: dz, ux: -dz, uz: dx, width: appearance.stairWidth,
        depth: appearance.stairDepth, base: ground, rise, steps: Math.ceil(rise / 0.2), yaw: Math.atan2(dx, dz) });
    }
    cache.set(b, result); return result;
  }

  function mesh(group, positions, material) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2)); g.computeVertexNormals();
    emit(group, g, material);
  }

  function quad(positions, a, b, c, d, up = false) {
    const crossY = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (up && crossY < 0) positions.push(...a, ...c, ...b, ...a, ...d, ...c);
    else positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  }

  function beam(group, a, b, width, material) {
    const direction = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), length = direction.length();
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction.normalize());
    box(group, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, length, width, width, material, 0, rotation);
  }

  function profile(l, angle) {
    const dx = Math.cos(angle), dz = Math.sin(angle), outer = ray(l.roof.ring, l.cx, l.cz, dx, dz), inner = ray(l.roof.holes[0], l.cx, l.cz, dx, dz);
    const bottom = ray(l.field.rings[0], l.cx, l.cz, dx, dz);
    const side = dx * l.uz - dz * l.ux;
    const high = l.b.h - 1.2, low = l.appearance.roofLow;
    return { dx, dz, outer, inner, bottom, height: low + (high - low) * side * side };
  }

  function roofPoint(l, angle, t) {
    const p = profile(l, angle), distance = p.outer * (1 - t) + p.inner * t;
    return [l.cx + p.dx * distance, l.base + p.height + Math.sin(Math.PI * t) * 1.2, l.cz + p.dz * distance];
  }

  function canopy(group, l) {
    for (const [lo, hi, material] of [[0, 0.055, white], [0.055, 0.7, green], [0.7, 1, white]]) {
      const positions = [];
      for (let i = 0; i < samples; i++) {
        const a = i * Math.PI * 2 / samples, c = (i + 1) * Math.PI * 2 / samples;
        quad(positions, roofPoint(l, a, lo), roofPoint(l, c, lo), roofPoint(l, c, hi), roofPoint(l, a, hi), true);
      }
      mesh(group, positions, material);
      const underside = [];
      for (let i = 0; i < positions.length; i += 9) for (const vertex of [0, 2, 1]) {
        const offset = i + vertex * 3; underside.push(positions[offset], positions[offset + 1] - 0.22, positions[offset + 2]);
      }
      mesh(group, underside, metal);
    }
    for (let i = 0; i < samples; i += 4) {
      const angle = i * Math.PI * 2 / samples, a = roofPoint(l, angle, 0), b = roofPoint(l, angle, 1);
      beam(group, a.map((v, i) => i === 1 ? v - 0.4 : v), b.map((v, i) => i === 1 ? v - 0.4 : v), 0.18, metal);
      const below = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 2.4, (a[2] + b[2]) / 2];
      beam(group, a, below, 0.16, metal); beam(group, below, b, 0.16, metal);
    }
  }

  function shell(group, l) {
    const positions = [], screen = [], skirt = [];
    for (let i = 0; i < samples; i++) {
      const a = profile(l, i * Math.PI * 2 / samples), c = profile(l, (i + 1) * Math.PI * 2 / samples);
      const ax = l.cx + a.dx * a.outer * 0.985, az = l.cz + a.dz * a.outer * 0.985,
        bx = l.cx + c.dx * c.outer * 0.985, bz = l.cz + c.dz * c.outer * 0.985;
      const ay = l.base + a.height - 3, by = l.base + c.height - 3;
      const media = l.appearance.mediaAngle !== undefined && Math.cos(i * Math.PI * 2 / samples - l.appearance.mediaAngle) > 0.82;
      quad(media ? screen : positions, [ax, l.base + l.podium.h, az], [ax, ay, az], [bx, by, bz], [bx, l.base + l.podium.h, bz]);
      quad(skirt, [ax, l.base, az], [ax, l.base + l.podium.h, az], [bx, l.base + l.podium.h, bz], [bx, l.base, bz]);
      if (i % 2 === 0) box(group, ax, (l.base + l.podium.h + ay) / 2, az, 0.18, ay - l.base - l.podium.h, 0.18, metal);
      beam(group, [ax, ay, az], [bx, by, bz], 0.55, white);
      for (const y of [9, 16, 23]) if (y < Math.min(a.height, c.height) - 4) beam(group, [ax, l.base + y, az], [bx, l.base + y, bz], 0.18, dark);
      if (i % 12 === 0) box(group, ax, (ay + l.base + l.podium.h) / 2, az, 1.1, ay - l.base - l.podium.h, 1.1, white);
    }
    mesh(group, positions, glazing); mesh(group, skirt, white); if (screen.length) mesh(group, screen, green);
    if (l.appearance.mediaAngle !== undefined) {
      const a = l.appearance.mediaAngle, p = profile(l, a);
      label(group, 'АК БАРС АРЕНА', l.cx + p.dx * p.outer * 0.991, l.base + 22, l.cz + p.dz * p.outer * 0.991,
        62, 5, Math.atan2(p.dx, p.dz), '#dce4dc');
    }
  }

  function bowl(group, l) {
    const treads = [], risers = [], aisles = [], rows = 36;
    function point(angle, t, rowHeight) {
      const p = profile(l, angle), radius = p.bottom + 1 + (p.outer * 0.93 - p.bottom - 1) * t;
      return [l.cx + p.dx * radius, l.fieldY + 0.7 + (p.height - 7) * rowHeight, l.cz + p.dz * radius];
    }
    for (let row = 0; row < rows; row++) for (let i = 0; i < samples; i++) {
      const a = i * Math.PI * 2 / samples, c = (i + 1) * Math.PI * 2 / samples, lo = row / rows, hi = (row + 1) / rows;
      const aisle = i % 8 === 0 || row % 9 === 0;
      quad(aisle ? aisles : treads, point(a, lo, lo), point(c, lo, lo), point(c, hi, lo), point(a, hi, lo), true);
      quad(aisle ? aisles : row % 2 ? treads : risers, point(a, hi, lo), point(c, hi, lo), point(c, hi, hi), point(a, hi, hi));
    }
    mesh(group, treads, red); mesh(group, risers, redDark); mesh(group, aisles, deck);
  }

  function pitch(group, l) {
    const g = new THREE.ShapeGeometry(shapeOf(l.field.rings[0], l.field.holes)); g.rotateX(-Math.PI / 2).translate(0, l.fieldY, 0); emit(group, g, grass);
    const yaw = -Math.atan2(l.uz, l.ux), length = l.appearance.pitchLength || 105, width = l.appearance.pitchWidth || 68;
    function rect(u, v, w, d, material = white, y = l.fieldY + 0.04, height = 0.035) {
      box(group, l.cx + l.ux * u - l.uz * v, y, l.cz + l.uz * u + l.ux * v, w, height, d, material, yaw);
    }
    function outline(u, v, w, d) {
      for (const side of [-1, 1]) { rect(u, v + side * d / 2, w, 0.13); rect(u + side * w / 2, v, 0.13, d); }
    }
    for (let i = 0; i < 10; i += 2) rect(-length / 2 + (i + 0.5) * length / 10, 0, length / 10, width, stripe, l.fieldY + 0.015, 0.012);
    outline(0, 0, length, width); rect(0, 0, 0.13, width);
    for (let i = 0; i < 48; i++) {
      const a = i * Math.PI / 24, c = (i + 1) * Math.PI / 24;
      const p = [l.cx + l.ux * Math.cos(a) * 9.15 - l.uz * Math.sin(a) * 9.15, l.fieldY + 0.055, l.cz + l.uz * Math.cos(a) * 9.15 + l.ux * Math.sin(a) * 9.15],
        q = [l.cx + l.ux * Math.cos(c) * 9.15 - l.uz * Math.sin(c) * 9.15, l.fieldY + 0.055, l.cz + l.uz * Math.cos(c) * 9.15 + l.ux * Math.sin(c) * 9.15];
      beam(group, p, q, 0.13, white);
    }
    for (const side of [-1, 1]) {
      outline(side * (length / 2 - 8.25), 0, 16.5, 40.32); outline(side * (length / 2 - 2.75), 0, 5.5, 18.32);
      for (const edge of [-1, 1]) rect(side * length / 2, edge * 3.66, 0.12, 0.12, white, l.fieldY + 1.22, 2.44);
      rect(side * length / 2, 0, 0.12, 7.44, white, l.fieldY + 2.44, 0.12);
      for (const edge of [-1, 1]) rect(side * (length / 2 + 1.2), edge * 3.66, 2.4, 0.08, white, l.fieldY + 0.08, 0.08);
    }
  }

  function emitBuilding(group, b) {
    if (b.model !== 'open-stadium') return false;
    const l = layout(b); if (!l) return false;
    const geometry = new THREE.ExtrudeGeometry(shapeOf(l.podium.ring, [l.roof.ring]), { depth: l.podium.h, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2).translate(0, l.base, 0); splitExtrusion(group, geometry, deck, white);
    for (let i = 0; i < l.podium.ring.length; i += 2) {
      const j = (i + 2) % l.podium.ring.length, ax = l.podium.ring[i], az = l.podium.ring[i + 1], bx = l.podium.ring[j], bz = l.podium.ring[j + 1];
      const ground = Math.min(terrainHeight(ax, az), terrainHeight(bx, bz), terrainHeight((ax + bx) / 2, (az + bz) / 2));
      if (ground < l.base) box(group, (ax + bx) / 2, (ground + l.base) / 2, (az + bz) / 2,
        Math.hypot(bx - ax, bz - az), l.base - ground, 0.22, white, -Math.atan2(bz - az, bx - ax));
    }
    canopy(group, l); shell(group, l); bowl(group, l); pitch(group, l);
    for (const stair of l.stairs) for (let i = 0; i < stair.steps; i++) {
      const depth = stair.depth * (stair.steps - i) / stair.steps, height = stair.rise * (i + 1) / stair.steps;
      box(group, stair.x + stair.nx * depth / 2, stair.base + height / 2, stair.z + stair.nz * depth / 2,
        stair.width, height, depth, deck, -Math.atan2(stair.uz, stair.ux));
    }
    return true;
  }

  function collisionShapes(b) {
    if (b.model !== 'open-stadium') return null;
    const l = layout(b); if (!l) return null;
    return [{ ...b, ring: l.podium.ring, holes: [l.roof.ring], h: l.podium.h },
      { ...b, ring: l.roof.ring, holes: l.field.rings, h: b.h - 4 },
      { ...b, ring: l.roof.ring, holes: l.roof.holes, minHeight: l.appearance.roofLow - 1, h: b.h }];
  }

  function surfaceHeight(x, z, referenceY, height) {
    for (const [reference, appearance] of appearances) {
      if (reference !== appearance.main) continue;
      const b = buildings.get(reference), l = b && layout(b); if (!l) continue;
      let candidate;
      if (pointInPoly(toPoints(l.field.rings[0]), x, z)) candidate = l.fieldY;
      else if (pointInPoly(toPoints(l.podium.ring), x, z) && !pointInPoly(toPoints(l.roof.ring), x, z)) candidate = l.base + l.podium.h;
      for (const s of l.stairs) {
        const dx = x - s.x, dz = z - s.z, u = dx * s.ux + dz * s.uz, d = dx * s.nx + dz * s.nz;
        if (Math.abs(u) > s.width / 2 || d < 0 || d > s.depth) continue;
        candidate = s.base + s.rise * Math.min(s.steps, Math.max(1, Math.ceil((1 - d / s.depth) * s.steps))) / s.steps;
      }
      if (candidate !== undefined && (!Number.isFinite(referenceY) || referenceY >= candidate - 0.5 && referenceY <= candidate + 2.5)) height = Math.max(height, candidate);
    }
    return height;
  }
  return { emitBuilding, collisionShapes, surfaceHeight };
}
