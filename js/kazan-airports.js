import { GEO } from './kazan-runtime.js';
import * as THREE from 'three/webgpu';
import { toPoints, boundsOf, pointInPoly, roadHeight } from './kazan-config.js';
import { floor, fract, sin, dot, vec2, color, mix, positionWorld, smoothstep, min } from 'three/tsl';

const CELL = 256, grid = new Map();
const fields = (GEO.airfields || []).map((field) => ({ ...field, points: field.pts ? toPoints(field.pts) : [],
  polygons: (field.rings || []).map(toPoints), inner: (field.holes || []).map(toPoints) }));

function index(item, bounds) {
  for (let x = Math.floor((bounds.minX - 60) / CELL); x <= Math.floor((bounds.maxX + 60) / CELL); x++) {
    for (let z = Math.floor((bounds.minZ - 60) / CELL); z <= Math.floor((bounds.maxZ + 60) / CELL); z++) {
      const key = `${x},${z}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(item);
    }
  }
}
for (const field of fields) {
  if (field.kind === 'parking_position') continue;
  if (field.polygons.length) index({ field }, boundsOf(field.polygons.flat()));
  for (let i = 1; i < field.points.length; i++) {
    const a = field.points[i - 1], b = field.points[i], w = field.w / 2;
    index({ field, a, b }, { minX: Math.min(a.x, b.x) - w, maxX: Math.max(a.x, b.x) + w,
      minZ: Math.min(a.z, b.z) - w, maxZ: Math.max(a.z, b.z) + w });
  }
}

function distance(a, b, x, z) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
}

/** Shared pavement clearance keeps both nearby trunks and distant forest crowns out of aircraft movement areas. */
export function airfieldAt(x, z, clearance = 0) {
  for (const item of grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) || []) {
    const f = item.field;
    if (item.a) {
      if (distance(item.a, item.b, x, z) <= f.w / 2 + clearance) return f;
    } else {
      if (f.polygons.some((p) => pointInPoly(p, x, z)) && !f.inner.some((p) => pointInPoly(p, x, z))) return f;
      if (clearance && [...f.polygons, ...f.inner].some((p) => p.some((a, i) => distance(a, p[(i + 1) % p.length], x, z) <= clearance))) return f;
    }
  }
  return null;
}

/** Mapped runway, taxiway, apron and stand geometry share terrain support, with separate aviation markings. */
export function createKazanAirports(draw) {
  const { roadStrip, shapeOf, emit, plainMaterial } = draw;

  const materials = new Map(), white = plainMaterial(0xd9d9cc), yellow = plainMaterial(0xd0ad35);
  function pavement(surface) {
    const key = /grass|ground|dirt|gravel/.test(surface) ? 'unpaved' : /asphalt/.test(surface) ? 'asphalt' : 'concrete';
    if (materials.has(key)) return materials.get(key);
    const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.96 });
    const p = vec2(positionWorld.x, positionWorld.z), cell = p.div(key === 'concrete' ? 6 : 3);
    const noise = fract(sin(dot(floor(cell), vec2(12.9898, 78.233))).mul(43758.5453));
    const base = color(key === 'concrete' ? 0x42494b : key === 'asphalt' ? 0x303638 : 0x79845b);
    let shade = noise.mul(0.12).add(0.94);
    if (key === 'concrete') {
      const uv = fract(cell), edge = min(min(uv.x, uv.y), min(uv.x.oneMinus(), uv.y.oneMinus()));
      shade = shade.mul(mix(0.82, 1, smoothstep(0, 0.008, edge)));
    }
    material.colorNode = base.mul(shade);
    material.name = `AirportPavement/${key}`;
    materials.set(key, material);
    return material;
  }

  function line(group, a, b, width, material, height = 0.16) {
    if (Math.hypot(a.x - b.x, a.z - b.z) > 0.01) roadStrip(group, { pts: [a, b] }, width, height, material);
  }

  function pathPoint(f, station, lateral = 0) {
    for (let i = 1; i < f.points.length; i++) {
      const a = f.points[i - 1], b = f.points[i], length = Math.hypot(b.x - a.x, b.z - a.z);
      if (station > length && i < f.points.length - 1) { station -= length; continue; }
      const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
      return { x: a.x + dx * station - dz * lateral, z: a.z + dz * station + dx * lateral, dx, dz };
    }
  }

  function apron(group, f, material) {
    const positions = [], uv = [];
    function triangle(a, b, c, depth = 0) {
      const points = [a, b, c], heights = points.map((p) => roadHeight(null, p[0], p[1]));
      let edge = 0, longest = 0, error = 0;
      for (let i = 0; i < 3; i++) {
        const p = points[i], q = points[(i + 1) % 3], length = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (length > longest) { edge = i; longest = length; }
        error = Math.max(error, Math.abs(roadHeight(null, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2) - (heights[i] + heights[(i + 1) % 3]) / 2));
      }
      error = Math.max(error, Math.abs(roadHeight(null, (a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3) - (heights[0] + heights[1] + heights[2]) / 3));
      if (depth < 18 && (longest > 40 || error > 0.025 && longest > 0.5)) {
        const p = points[edge], q = points[(edge + 1) % 3], r = points[(edge + 2) % 3], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        triangle(p, m, r, depth + 1); triangle(m, q, r, depth + 1);
      } else for (const [i, p] of points.entries()) { positions.push(p[0], heights[i] + 0.09, p[1]); uv.push(p[0], p[1]); }
    }
    for (const ring of f.rings) {
      const source = new THREE.ShapeGeometry(shapeOf(ring, f.holes)).toNonIndexed(); source.rotateX(-Math.PI / 2);
      const p = source.attributes.position;
      for (let i = 0; i < p.count; i += 3) triangle([p.getX(i), p.getZ(i)], [p.getX(i + 1), p.getZ(i + 1)], [p.getX(i + 2), p.getZ(i + 2)]);
      source.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.computeVertexNormals();
    emit(group, geometry, material);
  }

  function number(group, text, p, reverse = false) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#deded4'; ctx.font = 'bold 212px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 128, 135, 240);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshStandardNodeMaterial({ map: texture, transparent: true, depthWrite: false, roughness: 0.9 });
    const geometry = new THREE.PlaneGeometry(9, 14, 2, 4); geometry.rotateX(-Math.PI / 2);
    geometry.rotateY(-Math.atan2(p.dz, p.dx) - Math.PI / 2 + (reverse ? Math.PI : 0)).translate(p.x, 0, p.z);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) position.setY(i, roadHeight(null, position.getX(i), position.getZ(i)) + 0.19);
    geometry.computeVertexNormals(); emit(group, geometry.toNonIndexed(), material);
  }

  function build(group) {
    for (const f of fields.filter((f) => f.kind === 'apron')) apron(group, f, pavement(f.surface));
    for (const f of fields.filter((f) => f.kind === 'taxiway' || f.kind === 'runway')) {
      roadStrip(group, { pts: f.points }, f.w, 0.105, pavement(f.surface));
      if (/grass|ground|dirt|gravel/.test(f.surface)) continue;
      if (f.kind === 'taxiway') { roadStrip(group, { pts: f.points }, 0.28, 0.16, yellow); continue; }
      let length = 0;
      for (let i = 1; i < f.points.length; i++) length += Math.hypot(f.points[i].x - f.points[i - 1].x, f.points[i].z - f.points[i - 1].z);
      for (const side of [-1, 1]) for (let s = 0; s < length; s += 40) line(group, pathPoint(f, s, side * (f.w / 2 - 1)), pathPoint(f, Math.min(length, s + 40), side * (f.w / 2 - 1)), 0.5, white);
      for (let s = 135; s < length - 135; s += 60) line(group, pathPoint(f, s), pathPoint(f, Math.min(s + 30, length - 135)), 0.9, white);
      for (const end of [0, 1]) {
        for (const side of [-1, 1]) for (let i = 0; i < Math.min(4, Math.floor((f.w / 2 - 5) / 3.4)); i++) {
          const offset = side * (4 + i * 3.4), from = end ? length - 8 : 8, to = end ? length - 36 : 36;
          line(group, pathPoint(f, from, offset), pathPoint(f, to, offset), 1.8, white);
        }
        if (/^\d{2}[LCR]?\/\d{2}[LCR]?$/.test(f.ref)) number(group, f.ref.split('/')[end], pathPoint(f, end ? length - 65 : 65), !!end);
      }
    }
    const terminals = GEO.buildings.filter((b) => b.kind === 'airport');
    for (const f of fields.filter((f) => f.kind === 'parking_position' && Number.isFinite(f.x))) {
      if (!airfieldAt(f.x, f.z)) continue;
      const terminal = terminals.map((b) => boundsOf(toPoints(b.ring))).sort((a, b) => Math.hypot((a.minX + a.maxX) / 2 - f.x, (a.minZ + a.maxZ) / 2 - f.z) - Math.hypot((b.minX + b.maxX) / 2 - f.x, (b.minZ + b.maxZ) / 2 - f.z))[0];
      if (!terminal) continue;
      const dx = f.x - (terminal.minX + terminal.maxX) / 2, dz = f.z - (terminal.minZ + terminal.maxZ) / 2, len = Math.hypot(dx, dz) || 1;
      const ux = dx / len, uz = dz / len;
      line(group, f, { x: f.x + ux * 18, z: f.z + uz * 18 }, 0.25, yellow);
      line(group, { x: f.x - uz * 3, z: f.z + ux * 3 }, { x: f.x + uz * 3, z: f.z - ux * 3 }, 0.3, yellow);
    }
  }
  return { build };
}
