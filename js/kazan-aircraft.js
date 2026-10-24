import * as THREE from 'three/webgpu';
import { GEO, services } from './kazan-runtime.js';
import { groundSurfaceHeight, toPoints } from './kazan-config.js';

const sites = (GEO.aircraft || []).filter((s) => s.model);
const point = (s, u, y, d) => new THREE.Vector3(s.x + Math.cos(s.yaw) * u + Math.sin(s.yaw) * d,
  s.base + y, s.z - Math.sin(s.yaw) * u + Math.cos(s.yaw) * d);
const local = (s, x, z) => ({ u: (x - s.x) * Math.cos(s.yaw) - (z - s.z) * Math.sin(s.yaw),
  d: (x - s.x) * Math.sin(s.yaw) + (z - s.z) * Math.cos(s.yaw) });
const stairs = new Map();

/** Keep planted trees and regional crowns outside the mapped aircraft installation. */
export function aircraftAt(x, z, margin = 0) {
  return sites.some((s) => {
    const p = local(s, x, z);
    return Math.abs(p.u) < s.span / 2 + 2 + margin && Math.abs(p.d) < s.length / 2 + 3 + margin;
  });
}

/** Museum stair treads share their actual elevations with the walking controller. */
function aircraftSurfaceHeight(x, z, referenceY, height) {
  for (const stair of stairs.values()) {
    const p = local(stair.site, x, z);
    if (Math.abs(p.u - stair.u) > stair.width / 2 || p.d < stair.start || p.d > stair.end) continue;
    const n = Math.min(stair.count, Math.floor((p.d - stair.start) / stair.run) + 1);
    const candidate = stair.bottom + n * stair.rise;
    if (Number.isFinite(referenceY) ? Math.abs(candidate - referenceY) < Math.abs(height - referenceY) : candidate > height) height = candidate;
  }
  return height;
}
services.aircraftSurfaceHeight = aircraftSurfaceHeight;

/** Shared airframe lofts, thick wing panels, undercarriage and museum fittings use mapped axes. */
export function createKazanAircraft(draw) {
  const { plainMaterial, emit, flush, label, buildingCollider } = draw;
  const white = plainMaterial(0xe3e5de), silver = plainMaterial(0x9da6a5, 0.45), blue = plainMaterial(0x216da8);
  const glass = plainMaterial(0x263e49, 0.3), black = plainMaterial(0x242b2c), steel = plainMaterial(0x666f6b, 0.35);
  const dark = plainMaterial(0x101b20), red = plainMaterial(0xb43f37);

  function mesh(group, s, geometry, material) {
    geometry.rotateY(s.yaw).translate(s.x, s.base, s.z);
    const unindexed = geometry.index ? geometry.toNonIndexed() : geometry;
    emit(group, unindexed, material);
    if (unindexed !== geometry) geometry.dispose();
  }

  function block(group, s, u, y, d, w, h, depth, material) {
    mesh(group, s, new THREE.BoxGeometry(w, h, depth).translate(u, y, d), material);
  }

  function beam(group, s, a, b, radius, material) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), delta = to.clone().sub(from);
    const geometry = new THREE.CylinderGeometry(radius, radius, delta.length(), 6);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    mesh(group, s, geometry.translate(...from.add(to).multiplyScalar(0.5).toArray()), material);
  }

  function triangles(group, s, points, material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(points.length * 2), 2));
    geometry.computeVertexNormals();
    mesh(group, s, geometry, material);
  }

  function panel(group, s, outline, thickness, material) {
    const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p[0], p[2])));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
    geometry.rotateX(Math.PI / 2);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i);
      let best = Infinity, y = outline[0][1];
      for (const p of outline) {
        const distance = Math.hypot(x - p[0], z - p[2]);
        if (distance < best) { best = distance; y = p[1]; }
      }
      positions.setY(i, positions.getY(i) + y);
    }
    geometry.computeVertexNormals();
    mesh(group, s, geometry, material);
  }

  function fin(group, s, outline, thickness, material) {
    const shape = new THREE.Shape(outline.map(([d, y]) => new THREE.Vector2(d, y)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
    geometry.rotateY(-Math.PI / 2).translate(thickness / 2, 0, 0);
    mesh(group, s, geometry, material);
  }

  function loft(group, s, sections, paint = false, lateral = 0) {
    const pale = [], belt = [], lower = [], sides = 32;
    for (let i = 1; i < sections.length; i++) {
      for (let j = 0; j < sides; j++) {
        const a = j * Math.PI * 2 / sides, b = (j + 1) * Math.PI * 2 / sides;
        const vertices = [];
        for (const k of [i - 1, i]) for (const angle of [a, b]) {
          const [d, y, rx, ry] = sections[k];
          vertices.push([lateral + Math.sin(angle) * rx, y + Math.cos(angle) * ry, d]);
        }
        const stripe = paint && i > 2 && i < sections.length - 3 && Math.abs(Math.cos((a + b) / 2)) < 0.2;
        const ansatBlue = paint === 'ansat' && (sections[i][0] < -2.4 || Math.cos((a + b) / 2) > 0.52 || Math.cos((a + b) / 2) < -0.86);
        const target = paint === 'ansat' ? ansatBlue ? belt : pale : stripe ? belt : paint && Math.cos((a + b) / 2) < -0.65 ? lower : pale;
        target.push(vertices[0], vertices[2], vertices[1], vertices[1], vertices[2], vertices[3]);
      }
    }
    for (const [vertices, material] of [[pale, white], [belt, blue], [lower, silver]]) if (vertices.length) triangles(group, s, vertices, material);
    for (const [section, yaw] of [[sections[0], Math.PI], [sections.at(-1), 0]]) {
      const [d, y, rx, ry] = section;
      mesh(group, s, new THREE.CircleGeometry(1, sides).scale(rx, ry, 1).rotateY(yaw).translate(lateral, y, d), white);
    }
  }

  function shapeCollision(colliders, s, ring, bottom, top) {
    colliders.push(buildingCollider({ ring: ring.flatMap(([u, d]) => {
      const p = point(s, u, 0, d); return [p.x, p.z];
    }), holes: [], minHeight: bottom, h: top }, s.base));
  }

  function gear(group, s, colliders, u, d, main = false, { lift = 0, hub = silver } = {}) {
    const p = point(s, u, 0, d), ground = groundSurfaceHeight(p.x, p.z) - s.base;
    const wheelY = ground + lift + (main ? 0.68 : 0.5), radius = main ? 0.65 : 0.47;
    beam(group, s, [u, wheelY, d], [u * 0.8, 4.8, d + 0.6], 0.13, silver);
    beam(group, s, [u, wheelY + 0.5, d], [u * 0.7, 4.5, d - 1.5], 0.08, silver);
    for (const v of main ? [-0.95, 0, 0.95] : [0]) for (const side of [-1, 1]) {
      const wheel = new THREE.CylinderGeometry(radius, radius, 0.32, 16).rotateZ(Math.PI / 2).translate(u + side * 0.44, wheelY, d + v);
      mesh(group, s, wheel, black);
      const hubGeometry = new THREE.CylinderGeometry(radius * 0.48, radius * 0.48, 0.34, 12).rotateZ(Math.PI / 2).translate(u + side * 0.44, wheelY, d + v);
      mesh(group, s, hubGeometry, hub);
    }
    shapeCollision(colliders, s, [[u - 0.8, d - 1.5], [u + 0.8, d - 1.5], [u + 0.8, d + 1.5], [u - 0.8, d + 1.5]], ground + lift, 4.5);
  }

  function star(group, s, u, y, d, radius, side, wing = false) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5, r = i % 2 ? radius * 0.42 : radius;
      if (!i) shape.moveTo(Math.sin(a) * r, Math.cos(a) * r);
      else shape.lineTo(Math.sin(a) * r, Math.cos(a) * r);
    }
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape);
    if (wing) geometry.rotateX(-Math.PI / 2);
    else geometry.rotateY(side * Math.PI / 2);
    mesh(group, s, geometry.translate(u, y, d), red);
  }

  function bodyTop(sections, u, d) {
    const i = Math.max(1, sections.findIndex((p) => p[0] >= d)), a = sections[i - 1], b = sections[i];
    const t = Math.max(0, Math.min(1, (d - a[0]) / (b[0] - a[0]))), rx = a[2] * (1 - t) + b[2] * t;
    return a[1] * (1 - t) + b[1] * t + (a[3] * (1 - t) + b[3] * t) * Math.sqrt(Math.max(0, 1 - (u / rx) ** 2));
  }

  function tu22(group, s, colliders) {
    const half = s.length / 2, green = plainMaterial(0x526f4f), pad = plainMaterial(0x858d87);
    const sections = [[-half, 4.7, 1.8, 1.2], [-17, 4.95, 2.1, 1.5], [-10, 5.05, 2.05, 1.55],
      [-2, 5.1, 1.7, 1.55], [7, 5.15, 1.5, 1.4], [11, 5.15, 1.3, 1.3], [14, 5.1, 1.05, 1.1],
      [16.5, 4.85, 0.74, 0.74], [19, 4.72, 0.38, 0.38], [half, 4.7, 0.02, 0.02]];
    loft(group, s, sections);
    for (const side of [-1, 1]) {
      panel(group, s, [[side * 1.7, 4.75, 3.5], [side * 6.2, 4.65, 1.5], [side * s.span / 2, 4.75, -6.2],
        [side * s.span / 2, 4.75, -9.6], [side * 5.2, 4.6, -7.5], [side * 1.9, 4.65, -11]], 0.25, white);
      panel(group, s, [[side * 1.65, 4.7, -13], [side * 8.4, 4.6, -18.6], [side * 8.4, 4.6, -20.3], [side * 1.65, 4.7, -19]], 0.14, white);
      const intake = [[side * 1.25, 5.85, 7.5], [side * 2.5, 5.6, 5], [side * 2.45, 3.85, 4.3], [side * 1.5, 3.8, 6.8]];
      triangles(group, s, [intake[0], intake[1], intake[2], intake[0], intake[2], intake[3], intake[2], intake[1], intake[0], intake[3], intake[2], intake[0]], dark);
      panel(group, s, [[side * 1.3, 5.85, 7.5], [side * 2.5, 5.6, 5], [side * 2.1, 5.65, -10], [side * 1.6, 6, -10]], 0.16, white);
      const windscreen = [[side * 0.08, 13.8], [side * 0.65, 13.65], [side * 0.76, 14.7], [side * 0.1, 15.2]]
        .map(([u, d]) => [u, bodyTop(sections, u, d) + 0.1, d]);
      triangles(group, s, [windscreen[0], windscreen[1], windscreen[2], windscreen[0], windscreen[2], windscreen[3], windscreen[2], windscreen[1], windscreen[0], windscreen[3], windscreen[2], windscreen[0]], glass);
      block(group, s, side * 1.315, 5.75, 11.1, 0.055, 0.7, 0.9, glass);
      const p = point(s, side * 4.3, 0, -5.7), ground = groundSurfaceHeight(p.x, p.z) - s.base;
      block(group, s, side * 4.3, ground + 0.25, -5.7, 3.2, 0.5, 3.8, pad);
      shapeCollision(colliders, s, [[side * 4.3 - 1.6, -7.6], [side * 4.3 + 1.6, -7.6], [side * 4.3 + 1.6, -3.8], [side * 4.3 - 1.6, -3.8]], ground, ground + 0.5);
      gear(group, s, colliders, side * 4.3, -5.7, true, { lift: 0.5, hub: green });
      const tail = point(s, side * 2.1, 0, -18.6), low = groundSurfaceHeight(tail.x, tail.z) - s.base;
      block(group, s, side * 2.1, low + 0.1, -18.6, 1.1, 0.2, 1.8, pad);
      beam(group, s, [side * 2.1, low + 0.2, -18.6], [side * 2.1, 3.8, -18.6], 0.1, steel);
      shapeCollision(colliders, s, [[side * 2.1 - 0.15, -18.75], [side * 2.1 + 0.15, -18.75], [side * 2.1 + 0.15, -18.45], [side * 2.1 - 0.15, -18.45]], low, 3.8);
      const exhaust = new THREE.CylinderGeometry(0.86, 0.79, 1.15, 24, 1, true).rotateX(Math.PI / 2).translate(side * 1.02, 4.65, -20.85);
      mesh(group, s, exhaust, steel);
      mesh(group, s, new THREE.CircleGeometry(0.75, 24).rotateY(Math.PI).translate(side * 1.02, 4.65, -21.46), dark);
      star(group, s, side * 0.17, 9.6, -17.6, 0.75, side);
      star(group, s, side * 10.5, 4.94, -6.9, 0.85, side, true);
      shapeCollision(colliders, s, [[side * 1.7, 3.5], [side * s.span / 2, -6.2], [side * s.span / 2, -9.6], [side * 1.9, -11]], 4.35, 4.95);
      shapeCollision(colliders, s, [[side * 1.65, -13], [side * 8.4, -18.6], [side * 8.4, -20.3], [side * 1.65, -19]], 4.4, 4.85);
    }
    gear(group, s, colliders, 0, 13.5, false, { lift: 1.65, hub: green });
    fin(group, s, [[-9.8, 6], [-17.6, 11.6], [-20.1, 11.6], [-20.5, 5.2]], 0.3, white);
    shapeCollision(colliders, s, [[-0.15, -20.5], [0.15, -20.5], [0.15, -9.8], [-0.15, -9.8]], 5.2, 11.6);
    for (let i = 1; i < sections.length; i++) {
      const a = sections[i - 1], b = sections[i], w = Math.max(a[2], b[2]);
      shapeCollision(colliders, s, [[-w, a[0]], [w, a[0]], [w, b[0]], [-w, b[0]]], Math.min(a[1] - a[3], b[1] - b[3]), Math.max(a[1] + a[3], b[1] + b[3]));
    }
  }

  function ansat(group, s, colliders) {
    const sections = [[-7.4, 2.08, 0.08, 0.12], [-6.2, 2.02, 0.16, 0.2], [-4, 1.95, 0.24, 0.25],
      [-2.5, 1.85, 0.55, 0.55], [-1.6, 1.75, 1.02, 0.94], [-0.5, 1.73, 1.18, 1.02],
      [1.4, 1.73, 1.18, 1.02], [2.3, 1.72, 1.04, 0.96], [3.2, 1.52, 0.76, 0.67], [4.1, 1.24, 0.05, 0.13]];
    loft(group, s, sections, 'ansat');
    mesh(group, s, new THREE.SphereGeometry(1, 16, 8).scale(0.85, 0.48, 1.7).translate(0, 2.68, -0.25), blue);
    for (const side of [-1, 1]) {
      for (const [d, x, width] of [[-1.1, 1.14, 0.48], [0.25, 1.195, 0.48], [1.55, 1.17, 0.7]]) {
        block(group, s, side * x, 1.98, d, 0.055, 0.63, width, glass);
      }
      const windshield = [[side * 0.07, 2.45], [side * 0.8, 2.35], [side * 0.62, 3.25], [side * 0.07, 3.65]]
        .map(([u, d]) => [u, bodyTop(sections, u, d) + 0.05, d]);
      triangles(group, s, [windshield[0], windshield[1], windshield[2], windshield[0], windshield[2], windshield[3],
        windshield[2], windshield[1], windshield[0], windshield[3], windshield[2], windshield[0]], glass);
      let previous;
      for (let d = -1.8; d <= 3.31; d += 0.6) {
        const p = point(s, side * 1.3, 0, d), y = groundSurfaceHeight(p.x, p.z) - s.base + 0.065 + Math.max(0, d - 2.8) * 0.3;
        const next = [side * 1.3, y, d];
        if (previous) beam(group, s, previous, next, 0.055, steel);
        previous = next;
      }
      for (const d of [-1, 2]) {
        const p = point(s, side * 1.3, 0, d), low = groundSurfaceHeight(p.x, p.z) - s.base;
        beam(group, s, [side * 1.3, low + 0.08, d], [side * 0.72, 0.96, d], 0.055, steel);
      }
      panel(group, s, [[side * 0.16, 2.03, -5.7], [side * 1.5, 2.02, -6.2],
        [side * 1.5, 2.02, -6.6], [side * 0.16, 2.03, -6.45]], 0.07, blue);
    }
    fin(group, s, [[-6.3, 1.95], [-6.95, 3.28], [-7.6, 3.38], [-7.35, 1.32]], 0.12, blue);
    beam(group, s, [0, 3, 0.25], [0, 3.56, 0.25], 0.085, steel);
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2 + 0.2, cs = Math.cos(angle), sn = Math.sin(angle);
      const blade = [[0.35, -0.1], [5.3, -0.09], [5.3, 0.12], [0.35, 0.14]]
        .map(([u, d]) => [u * cs + d * sn, 3.55, 0.25 - u * sn + d * cs]);
      panel(group, s, blade, 0.028, black);
      const tailBlade = new THREE.BoxGeometry(0.035, 1.5, 0.12).rotateX(angle).translate(0.28, 2.05, -7.02);
      mesh(group, s, tailBlade, black);
    }
    for (let i = 1; i < sections.length; i++) {
      const a = sections[i - 1], b = sections[i], width = Math.max(a[2], b[2]);
      shapeCollision(colliders, s, [[-width, a[0]], [width, a[0]], [width, b[0]], [-width, b[0]]],
        Math.min(a[1] - a[3], b[1] - b[3]), Math.max(a[1] + a[3], b[1] + b[3]));
    }
    shapeCollision(colliders, s, [[-0.85, -1.95], [0.85, -1.95], [0.85, 1.45], [-0.85, 1.45]], 2.2, 3.16);
  }

  function sideLabel(group, s, text, side, d, y, width, height, hex) {
    const p = point(s, side * 1.72, y, d);
    label(group, text, p.x, p.y, p.z, width, height, s.yaw + side * Math.PI / 2, hex);
  }

  function tu144(group, s, colliders) {
    const half = s.length / 2;
    const sections = [[-half, 5.75, 0.04, 0.04], [-29, 5.75, 0.55, 0.65], [-25, 5.75, 1.2, 1.25],
      [-21, 5.75, 1.7, 1.65], [-12, 5.75, 1.7, 1.65], [0, 5.75, 1.7, 1.65], [13, 5.75, 1.65, 1.62],
      [21, 5.75, 1.52, 1.55], [24, 5.65, 1.3, 1.4], [26, 5.3, 1.02, 1.15], [29, 4.65, 0.55, 0.65], [half, 3.95, 0.025, 0.025]];
    loft(group, s, sections, true);
    for (const side of [-1, 1]) {
      panel(group, s, [[side * 1.35, 4.8, 10], [side * 5.7, 4.35, -4.4], [side * s.span / 2, 4.5, -17.2],
        [side * s.span / 2, 4.5, -21.95], [side * 1.4, 4.7, -21.6]], 0.24, silver);
      panel(group, s, [[side * 1.1, 7.4, 23.8], [side * 6.8, 6.75, 20.25], [side * 6.8, 6.75, 19.2], [side * 1.4, 7.4, 21.5]], 0.12, white);
      beam(group, s, [side * 1.8, 7.4, 22.7], [side * 6.6, 6.82, 20.2], 0.035, steel);
      for (let d = -18.5; d <= 18; d += 1.02) {
        const window = new THREE.CircleGeometry(0.19, 10).scale(1, 1.3, 1).rotateY(side * Math.PI / 2).translate(side * 1.713, 5.85, d);
        mesh(group, s, window, glass);
      }
      sideLabel(group, s, 'АЭРОФЛОТ', side, 9.3, 6.78, 11, 0.65, '#216da8');
      for (const d of [-20.2, 2, 20.7]) {
        const x = side * 1.72;
        for (const edge of [-1, 1]) beam(group, s, [x, 4.85, d + edge * 0.48], [x, 6.65, d + edge * 0.48], 0.025, blue);
        for (const y of [4.85, 6.65]) beam(group, s, [x, y, d - 0.48], [x, y, d + 0.48], 0.025, blue);
      }
      for (const a of [[side * 0.1, 6.98, 24.5], [side * 1.03, 6.62, 24.1]]) {
        const b = [side * 0.12, 6.45, 26.35], c = [side * 0.82, 6.12, 25.9];
        triangles(group, s, [a, b, c, a, c, [side * 1.15, 6.28, 24.7]], glass);
        triangles(group, s, [c, b, a, [side * 1.15, 6.28, 24.7], c, a], glass);
      }
      gear(group, s, colliders, side * 4.3, -13.5, true);
      shapeCollision(colliders, s, [[side * 1.1, 23.8], [side * 6.8, 20.25], [side * 6.8, 19.2], [side * 1.4, 21.5]], 6.62, 7.52);
    }
    gear(group, s, colliders, 0, 20.4);
    fin(group, s, [[-20.5, 6.6], [-27.4, 12.5], [-30.3, 12.5], [-32, 6.1]], 0.3, white);
    shapeCollision(colliders, s, [[-0.15, -32], [0.15, -32], [0.15, -20.5], [-0.15, -20.5]], 6.1, 12.5);
    for (const side of [-1, 1]) {
      const flag = new THREE.PlaneGeometry(1.8, 1).rotateY(side * Math.PI / 2).translate(side * 0.16, 10.2, -28.7);
      mesh(group, s, flag, red);
      const p = point(s, side * 0.17, 8.6, -28.6);
      label(group, 'СССР-77107', p.x, p.y, p.z, 5.2, 0.46, s.yaw + side * Math.PI / 2, '#344549');
    }
    for (const u of [-3.9, -2.25, 2.25, 3.9]) {
      block(group, s, u, 3.3, -14.8, 1.5, 1.65, 12.2, silver);
      block(group, s, u, 3.3, -8.65, 1.23, 1.32, 0.06, dark);
      const exhaust = new THREE.CylinderGeometry(0.69, 0.66, 0.8, 20, 1, true).rotateX(Math.PI / 2).translate(u, 3.25, -21.25);
      mesh(group, s, exhaust, steel);
      mesh(group, s, new THREE.CircleGeometry(0.62, 20).rotateY(Math.PI).translate(u, 3.25, -21.45), dark);
      shapeCollision(colliders, s, [[u - 0.75, -21.3], [u + 0.75, -21.3], [u + 0.75, -8.6], [u - 0.75, -8.6]], 2.45, 4.15);
    }
    for (let i = 1; i < sections.length; i++) {
      const a = sections[i - 1], b = sections[i], w = Math.max(a[2], b[2]);
      shapeCollision(colliders, s, [[-w, a[0]], [w, a[0]], [w, b[0]], [-w, b[0]]], Math.min(a[1] - a[3], b[1] - b[3]), Math.max(a[1] + a[3], b[1] + b[3]));
    }
    shapeCollision(colliders, s, [[-14, -22], [14, -22], [14, -17.2], [5.7, -4.4], [1.4, 10], [-1.4, 10], [-5.7, -4.4], [-14, -17.2]], 4.1, 4.85);
    frontStair(group, s, colliders);
  }

  function frontStair(group, s, colliders) {
    const u = 3, start = 8, end = 20.7, top = s.base + 4.83, width = 1.65;
    const foot = point(s, u, 0, start), bottom = groundSurfaceHeight(foot.x, foot.z) + 0.06;
    const count = Math.ceil((top - bottom) / 0.17), run = (end - start) / count, rise = (top - bottom) / count;
    stairs.set(s.id, { site: s, u, start, end, bottom, count, run, rise, width });
    for (let i = 1; i <= count; i++) block(group, s, u, bottom - s.base + i * rise - 0.045, start + (i - 0.5) * run, width, 0.09, run, steel);
    block(group, s, 2.4, top - s.base - 0.06, end + 0.65, 2.9, 0.12, 1.3, steel);
    for (const side of [-1, 1]) {
      const edge = u + side * width / 2;
      beam(group, s, [edge, bottom - s.base, start], [edge, top - s.base, end], 0.09, steel);
      for (const h of [0.55, 1.1]) beam(group, s, [edge, bottom - s.base + h, start], [edge, top - s.base + h, end], 0.045, steel);
      for (let i = 0; i <= count; i += 4) {
        const y = bottom - s.base + Math.min(count, i + 1) * rise, d = start + i * run;
        beam(group, s, [edge, y, d], [edge, y + 1.1, d], 0.035, steel);
      }
      for (const d of [end - 0.6, end + 1.2]) {
        const p = point(s, edge, 0, d), low = groundSurfaceHeight(p.x, p.z) - s.base;
        beam(group, s, [edge, low, d], [edge, top - s.base, d], 0.075, steel);
        shapeCollision(colliders, s, [[edge - 0.1, d - 0.1], [edge + 0.1, d - 0.1], [edge + 0.1, d + 0.1], [edge - 0.1, d + 0.1]], low, top - s.base + 0.1);
      }
    }
    stairs.set(`${s.id}/landing`, { site: s, u: 2.4, width: 2.9, start: end, end: end + 1.3, bottom: top, count: 1, run: 1.3, rise: 0 });
  }

  function museumShapes(b) {
    const p = toPoints(b.ring), main = p.slice(6, 19).concat([{ x: 1705.1, z: -3547.9 }, { x: 1722.7, z: -3547.9 }]);
    const shapes = [{ ...b, ring: main.flatMap((v) => [v.x, v.z]), minHeight: 0, h: 4.25 }];
    for (let i = 0; i < 8; i++) {
      const a = -3531.7 - i * 2.025, c = a - 2.025, floor = 4.83 - i / 8 * 1.23;
      shapes.push({ ...b, ring: [1712.1, a, 1715, a, 1715, c, 1712.1, c], minHeight: floor - 1.23 / 8, h: floor + 2.35 });
    }
    return shapes;
  }

  function emitBuilding(group, b, base) {
    if (b.model !== 'tu144-museum') return false;
    const s = { x: 0, z: 0, yaw: 0, base }, shapes = museumShapes(b), ring = toPoints(shapes[0].ring);
    panel(group, s, ring.map((p) => [p.x, 4.25, p.z]), 0.2, white);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
      const geometry = new THREE.BoxGeometry(length, 3.7, 0.14).rotateY(-Math.atan2(dz, dx)).translate((a.x + b.x) / 2, 2.05, (a.z + b.z) / 2);
      mesh(group, s, geometry, glass);
      for (const y of [0.25, 3.85]) beam(group, s, [a.x, y, a.z], [b.x, y, b.z], 0.13, white);
      const n = Math.ceil(length / 2.2);
      for (let j = 0; j <= n; j++) block(group, s, a.x + dx * j / n, 2.05, a.z + dz * j / n, 0.1, 3.7, 0.1, white);
    }
    const floor = (z) => 4.83 + (z + 3531.7) / 16.2 * 1.23;
    for (const [rise, thickness, width, material] of [[0, 0.16, 2.9, steel], [2.35, 0.2, 3.2, white]]) {
      const slab = new THREE.BoxGeometry(width, thickness, 16.2), pos = slab.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + floor(pos.getZ(i) - 3539.8) + rise);
      mesh(group, s, slab.translate(1713.55, 0, -3539.8), material);
    }
    for (const x of [1712.1, 1715]) {
      const wall = new THREE.BoxGeometry(0.1, 2.35, 16.2), pos = wall.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + floor(pos.getZ(i) - 3539.8) + 1.175);
      mesh(group, s, wall.translate(x, 0, -3539.8), glass);
      for (let z = -3547.7; z < -3531.6; z += 1.8) block(group, s, x, floor(z) + 1.175, z, 0.13, 2.35, 0.1, white);
      for (const z of [-3533, -3545.5]) block(group, s, x, floor(z) / 2, z, 0.16, floor(z), 0.16, steel);
    }
    return true;
  }

  function collisionShapes(b) {
    return b.model === 'tu144-museum' ? museumShapes(b) : null;
  }

  function build(parent) {
    const colliders = [];
    for (const site of sites) {
      const s = { ...site, base: groundSurfaceHeight(site.x, site.z) };
      const group = new THREE.Group(); group.name = `KazanAircraft/${s.id}`;
      if (s.model === 'tu144') tu144(group, s, colliders);
      else if (s.model === 'tu22m3') tu22(group, s, colliders);
      else if (s.model === 'ansat') ansat(group, s, colliders);
      flush(group); parent.add(group);
    }
    return colliders;
  }
  return { build, emitBuilding, collisionShapes };
}
