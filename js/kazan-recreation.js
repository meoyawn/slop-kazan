import * as THREE from 'three/webgpu';
import { GEO, runtime } from './kazan-runtime.js';
import { terrainHeight, toPoints, boundsOf, pointInPoly, groundMeshHeight, nearestRoads } from './kazan-config.js';

/** Activity outlines choose repeatable courts, bowls and pump tracks; internal obstacle layouts remain estimates. */
export function createKazanRecreation(draw) {
  const { plainMaterial, box, solid, polygon, emit, flush } = draw;
  const concrete = plainMaterial(0xb5b7ad), asphalt = plainMaterial(0x414b4d), turf = plainMaterial(0x718452);
  const orange = plainMaterial(0xbd805a), blue = plainMaterial(0x6a8098), white = plainMaterial(0xd9d9ca);
  const black = plainMaterial(0x35403f), red = plainMaterial(0xa65b40);

  function frame(site) {
    const poly = toPoints(site.ring), bounds = boundsOf(poly), cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
    let longest = 0, ux = 1, uz = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length > longest) { longest = length; ux = (b.x - a.x) / length; uz = (b.z - a.z) / length; }
    }
    const local = poly.map((p) => ({ x: (p.x - cx) * ux + (p.z - cz) * uz, z: -(p.x - cx) * uz + (p.z - cz) * ux }));
    const b = boundsOf(local), u = (b.minX + b.maxX) / 2, v = (b.minZ + b.maxZ) / 2;
    return { poly, cx: cx + ux * u - uz * v, cz: cz + uz * u + ux * v, ux, uz,
      w: b.maxX - b.minX, d: b.maxZ - b.minZ, yaw: -Math.atan2(uz, ux),
      y: Math.max(0.22, ...poly.map((p) => groundMeshHeight(p.x, p.z) + 0.14)) };
  }

  function point(f, u, v, y = f.y) {
    const x = f.cx + u * f.ux - v * f.uz, z = f.cz + u * f.uz + v * f.ux;
    return { x, y, z };
  }

  function rect(group, f, u, v, w, d, y, material) {
    const p = point(f, u, v, y);
    box(group, p.x, p.y, p.z, w, 0.04, d, material, f.yaw);
  }

  function outline(group, f, u, v, w, d, y, material) {
    for (const side of [-1, 1]) {
      rect(group, f, u, v + side * d / 2, w, 0.08, y, material);
      rect(group, f, u + side * w / 2, v, 0.08, d, y, material);
    }
  }

  function circle(group, f, u, v, radius, y, material) {
    for (let i = 0; i < 48; i++) {
      const a = i * Math.PI / 24, b = (i + 1) * Math.PI / 24;
      const p = point(f, u + Math.cos(a) * radius, v + Math.sin(a) * radius, y);
      const q = point(f, u + Math.cos(b) * radius, v + Math.sin(b) * radius, y);
      box(group, (p.x + q.x) / 2, y, (p.z + q.z) / 2, Math.hypot(q.x - p.x, q.z - p.z) + 0.02, 0.04, 0.07, material, -Math.atan2(q.z - p.z, q.x - p.x));
    }
  }

  function court(group, site, f) {
    const basket = site.kind === 'basketball', sand = site.kind === 'sand-court';
    polygon(site.ring, f.y - 0.05, sand ? plainMaterial(0xc4b48d) : basket ? orange : plainMaterial(0x547c61), group);
    const w = f.w - 4, d = f.d - 3;
    if (basket) rect(group, f, 0, 0, w, d, f.y, blue);
    outline(group, f, 0, 0, w, d, f.y + 0.05, white);
    rect(group, f, 0, 0, 0.08, d, f.y + 0.05, white);
    if (!sand) circle(group, f, 0, 0, Math.min(d * 0.2, basket ? 1.8 : 3), f.y + 0.05, white);
    if (basket) for (const side of [-1, 1]) {
      outline(group, f, side * (w / 2 - 2.8), 0, 5.6, Math.min(4.9, d * 0.5), f.y + 0.05, white);
      const post = point(f, side * (w / 2 + 0.6), 0), board = point(f, side * (w / 2 - 1.1), 0);
      box(group, post.x, f.y + 1.8, post.z, 0.16, 3.6, 0.16, black);
      rect(group, f, side * (w / 2 - 0.2), 0, 1.7, 0.12, f.y + 3.7, black);
      box(group, board.x, f.y + 3.52, board.z, 0.12, 1.05, 1.8, white, f.yaw);
      const hoop = new THREE.TorusGeometry(0.225, 0.035, 5, 16); hoop.rotateX(Math.PI / 2);
      const p = point(f, side * (w / 2 - 1.4), 0, f.y + 3.05); solid(group, hoop, red, p.x, p.y, p.z);
    }
    if (site.kind === 'football') for (const side of [-1, 1]) {
      const goal = point(f, side * w / 2, 0);
      for (const edge of [-1, 1]) {
        const p = point(f, side * w / 2, edge * 1.5);
        box(group, p.x, f.y + 1, p.z, 0.09, 2, 0.09, white);
      }
      box(group, goal.x, f.y + 2, goal.z, 0.09, 0.09, 3.1, white, f.yaw);
    }
  }

  function flowSurface(group, site, f) {
    const pump = site.kind === 'pump-track', scale = Math.min(f.w, f.d), bowls = pump ? [
      [-f.w * 0.23, -f.d * 0.12, f.w * 0.27, f.d * 0.3],
      [f.w * 0.22, f.d * 0.17, f.w * 0.27, f.d * 0.3],
      [f.w * 0.04, -f.d * 0.22, f.w * 0.2, f.d * 0.25]] : [
      [-f.w * 0.28, -f.d * 0.22, f.w * 0.18, f.d * 0.15],
      [f.w * 0.1, -f.d * 0.26, f.w * 0.2, f.d * 0.14],
      [f.w * 0.32, -f.d * 0.02, f.w * 0.12, f.d * 0.18],
      [-f.w * 0.29, f.d * 0.19, f.w * 0.19, f.d * 0.17],
      [f.w * 0.04, f.d * 0.08, f.w * 0.2, f.d * 0.2],
      [f.w * 0.2, f.d * 0.31, f.w * 0.16, f.d * 0.12]];
    polygon(site.ring, f.y - 0.06, pump ? turf : concrete, group);
    function sample(u, v) {
      let distance = Infinity, inside = Infinity;
      for (const [cu, cv, rx, rz] of bowls) {
        const r = Math.hypot((u - cu) / rx, (v - cv) / rz);
        distance = Math.min(distance, Math.abs(r - 1) * Math.min(rx, rz)); inside = Math.min(inside, r);
      }
      const edge = Math.min(f.w / 2 - Math.abs(u), f.d / 2 - Math.abs(v));
      const fade = Math.max(0, Math.min(1, edge / 4));
      const angle = Math.atan2(v / f.d, u / f.w), onTrack = distance < Math.min(2.6, scale * 0.06);
      const transition = Math.max(0, Math.min(1, (inside - 0.72) / 0.28));
      const height = pump ? onTrack ? 0.48 + 0.36 * Math.sin(angle * 7 + u * 0.1) : Math.min(1.5, distance * 0.2) :
        (1 - Math.cos(transition * Math.PI / 2)) * 2.4;
      const p = point(f, u, v, f.y + height * fade);
      return { ...p, track: onTrack, interior: inside < 0.84 };
    }
    const positions = [[], []], step = runtime?.lite ? 1.5 : 0.75;
    for (let u = -f.w / 2; u < f.w / 2; u += step) for (let v = -f.d / 2; v < f.d / 2; v += step) {
      const corners = [sample(u, v), sample(Math.min(u + step, f.w / 2), v),
        sample(Math.min(u + step, f.w / 2), Math.min(v + step, f.d / 2)), sample(u, Math.min(v + step, f.d / 2))];
      for (const indices of [[0, 2, 1], [0, 3, 2]]) {
        const tri = indices.map((i) => corners[i]);
        if (tri.some((p) => !pointInPoly(f.poly, p.x, p.z))) continue;
        const centre = sample(u + step / 2, v + step / 2);
        const category = (pump ? centre.track : centre.interior) ? 1 : 0;
        for (const p of tri) positions[category].push(p.x, p.y, p.z);
      }
    }
    for (const [i, vertices] of positions.entries()) {
      if (!vertices.length) continue;
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(vertices.flatMap((_, i) => i % 3 ? [] : [vertices[i], vertices[i + 2]]), 2));
      geometry.computeVertexNormals(); emit(group, geometry, pump ? i ? asphalt : turf : i ? plainMaterial(0x929f9f) : concrete);
    }
    if (!pump) for (const [u, v, rx, rz] of bowls) {
      for (let i = 0; i < 48; i++) {
        const a = i * Math.PI / 24, b = (i + 1) * Math.PI / 24;
        const p = sample(u + rx * Math.cos(a), v + rz * Math.sin(a)), q = sample(u + rx * Math.cos(b), v + rz * Math.sin(b));
        if (!pointInPoly(f.poly, p.x, p.z) || !pointInPoly(f.poly, q.x, q.z) || Math.min(p.y, q.y) < f.y + 1.2) continue;
        box(group, (p.x + q.x) / 2, (p.y + q.y) / 2 + 0.04, (p.z + q.z) / 2,
          Math.hypot(q.x - p.x, q.z - p.z) + 0.02, 0.07, 0.09, black, -Math.atan2(q.z - p.z, q.x - p.x));
      }
    }
  }

  function airPark(group, site, f) {
    polygon(site.ring, f.y - 0.05, concrete, group);
    const wood = plainMaterial(0x956b4d);
    for (const side of [-1, 1]) for (const lane of [-1, 0, 1]) {
      const w = f.w * 0.24, depth = f.d * 0.25, centre = lane * f.w * 0.28, vertices = [];
      for (let i = 0; i < 16; i++) {
        const a = i / 16, b = (i + 1) / 16;
        const p = [point(f, centre - w / 2, side * (f.d * 0.14 + a * depth), f.y + (1 - Math.cos(a * Math.PI / 2)) * 3),
          point(f, centre + w / 2, side * (f.d * 0.14 + a * depth), f.y + (1 - Math.cos(a * Math.PI / 2)) * 3),
          point(f, centre + w / 2, side * (f.d * 0.14 + b * depth), f.y + (1 - Math.cos(b * Math.PI / 2)) * 3),
          point(f, centre - w / 2, side * (f.d * 0.14 + b * depth), f.y + (1 - Math.cos(b * Math.PI / 2)) * 3)];
        for (const j of side > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) vertices.push(p[j].x, p[j].y, p[j].z);
      }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(vertices.flatMap((_, i) => i % 3 ? [] : [vertices[i], vertices[i + 2]]), 2));
      geometry.computeVertexNormals(); emit(group, geometry, wood);
    }
  }

  function build(parent) {
    const group = new THREE.Group(); group.name = 'KazanRecreation';
    let lamps = 0;
    for (const site of (GEO.recreation || []).filter((s) => s.site && s.kind)) {
      const f = frame(site);
      if (['skate-bowls', 'pump-track'].includes(site.kind)) flowSurface(group, site, f);
      else if (site.kind === 'air-park') airPark(group, site, f);
      else court(group, site, f);
      if (lamps++ < 12) {
        const p = point(f, -f.w / 2 - 1, f.d / 2 + 1);
        if (nearestRoads(p.x, p.z, 25).some((r) => r.road.bridge && r.dist < r.road.w / 2 + 2)) continue;
        box(group, p.x, f.y + 5.5, p.z, 0.18, 11, 0.18, black);
        box(group, p.x, f.y + 10.9, p.z, 2.2, 0.15, 0.35, black);
        for (const dx of [-0.7, 0.7]) box(group, p.x + dx, f.y + 10.8, p.z, 0.55, 0.4, 0.2, white);
      }
    }
    flush(group); parent.add(group);
  }
  return { build };
}
