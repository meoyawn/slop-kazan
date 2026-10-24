import * as THREE from 'three/webgpu';
import { GEO } from './kazan-runtime.js';
import { toPoints, boundsOf, pointInPoly, terrainHeight } from './kazan-config.js';

const keyOf = (b) => `${b.osmType}/${b.id}`;

/** Worship bodies share source-sized envelopes, arches, domes and towers in existing city tile batches. */
export function createKazanWorship(draw) {
  const { box, solid, emit, shapeOf, splitExtrusion, plainMaterial, buildingRoof } = draw;
  const bindings = new Map((GEO.worship?.bindings || []).map((b) => [b.reference, b])), parts = new Map(), cache = new Map();
  const minarets = GEO.buildings.filter((b) => b.towerType === 'minaret');
  const gold = plainMaterial(0xc2a151, 0.55), dark = plainMaterial(0x304d55, 0.2);
  for (const b of GEO.buildings.filter((b) => b.part)) {
    if (!parts.has(b.parent)) parts.set(b.parent, []);
    parts.get(b.parent).push(b);
  }
  function colour(value, fallback) {
    return value && (/^#[0-9a-f]{3,6}$/i.test(value) || value.toLowerCase() in THREE.Color.NAMES) ? new THREE.Color(value).getHex() : fallback;
  }
  function faces(b) {
    const poly = toPoints(b.ring), result = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], c = poly[(i + 1) % poly.length], length = Math.hypot(c.x - a.x, c.z - a.z);
      if (length < 0.3) continue;
      const ux = (c.x - a.x) / length, uz = (c.z - a.z) / length, x = (a.x + c.x) / 2, z = (a.z + c.z) / 2;
      let nx = -uz, nz = ux;
      if (pointInPoly(poly, x + nx * 0.05, z + nz * 0.05)) { nx = -nx; nz = -nz; }
      result.push({ x, z, ux, uz, nx, nz, length, yaw: -Math.atan2(uz, ux) });
    }
    return result;
  }
  function layout(b) {
    if (cache.has(b)) return cache.get(b);
    const binding = bindings.get(keyOf(b)); if (!binding || b.model) return null;
    const poly = toPoints(b.ring), bounds = boundsOf(poly), fs = faces(b), f = fs.reduce((a, c) => c.length > a.length ? c : a);
    const us = poly.map((p) => p.x * f.ux + p.z * f.uz), vs = poly.map((p) => -p.x * f.uz + p.z * f.ux);
    const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs), width = Math.min(u1 - u0, v1 - v0);
    let centre, clearance = 0;
    const candidates = [], rings = [poly, ...b.holes.map(toPoints)];
    for (const a of [0.5, 0.3, 0.7]) for (const c of [0.5, 0.3, 0.7]) {
      const u = u0 + (u1 - u0) * a, v = v0 + (v1 - v0) * c, p = { x: u * f.ux - v * f.uz, z: u * f.uz + v * f.ux };
      candidates.push(p);
    }
    const triangles = new THREE.ShapeGeometry(shapeOf(b.ring, b.holes)), positions = triangles.attributes.position, indices = triangles.index;
    for (let i = 0; i < (indices?.count || positions.count); i += 3) {
      let x = 0, z = 0;
      for (let j = 0; j < 3; j++) { const n = indices ? indices.getX(i + j) : i + j; x += positions.getX(n); z -= positions.getY(n); }
      candidates.push({ x: x / 3, z: z / 3 });
    }
    triangles.dispose();
    for (const p of candidates) {
      if (!pointInPoly(poly, p.x, p.z) || rings.slice(1).some((r) => pointInPoly(r, p.x, p.z))) continue;
      let distance = Infinity;
      for (const ring of rings) for (let i = 0; i < ring.length; i++) {
        const a = ring[i], c = ring[(i + 1) % ring.length], dx = c.x - a.x, dz = c.z - a.z;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
        distance = Math.min(distance, Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t));
      }
      if (distance > clearance) { centre = p; clearance = distance; }
    }
    const style = binding.style || {}, mappedParts = parts.get(keyOf(b)) || [];
    const rise = b.roofHeight || style.roofRise || (!mappedParts.length && (binding.role === 'principal' || b.roofShape !== 'flat') ? Math.min(5, width * 0.22) : 0);
    const estimatedTower = !binding.parent && binding.role === 'minaret' && b.heightSource === 'fallback';
    const low = estimatedTower ? 0 : b.minHeight || 0;
    const total = estimatedTower ? Math.max(24, b.h) : style.roofRise ? b.h + rise : b.h;
    const photographed = binding.styleSource === 'photographic-family-sample';
    const l = { binding, poly, bounds, fs, centre, clearance, width, mappedParts, total, low, roofAxis: { ux: f.ux, uz: f.uz, u0, u1, v0, v1 }, rise: Math.max(0, Math.min(total - low - 0.3, rise)),
      wall: plainMaterial(colour(photographed && style.wallColour ? style.wallColour : b.colour || style.wallColour, 0xe5dfcc)),
      roof: plainMaterial(colour(photographed && style.roofColour ? style.roofColour : b.roofColour || style.roofColour, 0x36755b), 0.25),
      trim: plainMaterial(colour(style.trimColour, 0xeeeade)), dome: plainMaterial(colour(b.roofColour || style.domeColour || style.roofColour, 0xc2a151), 0.35) };
    if (centre && binding.family === 'mosque' && binding.role === 'principal') {
      const mappedTower = mappedParts.some((part) => {
        const p = layout(part);
        return part.towerType === 'minaret' || p && p.width < 7 && part.h - (part.minHeight || 0) > p.width * 2.6;
      });
      const explicit = mappedTower || minarets.some((tower) => (!tower.parent || tower.parent === keyOf(b)) &&
        Math.hypot(tower.ring[0] - centre.x, tower.ring[1] - centre.z) < Math.max(u1 - u0, v1 - v0) + 15);
      const top = Math.max(l.total, ...mappedParts.map((p) => p.h));
      if (!explicit) l.minaret = { ...centre, radius: Math.min(clearance * 0.8, Math.max(0.45, Math.min(1.8, width * 0.12))),
        h: Math.max(top + 4, style.minaretHeight || Math.min(45, Math.max(16, top * 1.8))) };
    }
    cache.set(b, l); return l;
  }
  function panel(group, f, u, y, width, height, material, depth = 0.15, projection = 0.12) {
    box(group, f.x + f.ux * u + f.nx * projection, y, f.z + f.uz * u + f.nz * projection, width, height, depth, material, f.yaw);
  }
  function arch(group, f, u, y, width, height, material, projection) {
    const s = new THREE.Shape(), r = width / 2;
    s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, height - r); s.absarc(0, height - r, r, 0, Math.PI); s.closePath();
    const g = new THREE.ShapeGeometry(s, 8); g.rotateY(Math.atan2(f.nx, f.nz));
    solid(group, g, material, f.x + f.ux * u + f.nx * projection, y, f.z + f.uz * u + f.nz * projection);
  }
  function finial(group, p, y, size, muslim) {
    box(group, p.x, y + size * 0.45, p.z, 0.07, size * 0.9, 0.07, gold);
    if (muslim) {
      const g = new THREE.TorusGeometry(size * 0.23, size * 0.045, 3, 12, Math.PI * 1.5); g.rotateZ(-Math.PI * 0.75);
      solid(group, g, gold, p.x, y + size * 0.7, p.z);
    } else {
      box(group, p.x, y + size * 0.64, p.z, size * 0.6, 0.07, 0.07, gold);
      box(group, p.x, y + size * 0.86, p.z, size * 0.3, 0.05, 0.07, gold);
    }
  }
  function lathe(group, p, y, radius, height, profile, material) {
    solid(group, new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r * radius, h * height)), 16), material, p.x, y, p.z);
  }
  function planarRoof(group, b, base, l) {
    const a = l.roofAxis, radius = Math.min(a.u1 - a.u0, a.v1 - a.v0) / 2, positions = [], walls = [];
    const planes = b.roofShape === 'gabled' ? [[0, 1, -a.v0], [0, -1, a.v1]] : [[1, 0, -a.u0], [-1, 0, a.u1], [0, 1, -a.v0], [0, -1, a.v1]];
    function at(p, plane) { return p[0] * plane[0] + p[1] * plane[1] + plane[2]; }
    function height(p) { return base + l.total - l.rise + l.rise * Math.min(1, Math.max(0, Math.min(...planes.map((q) => at(p, q))) / radius)); }
    function world(p, y = height(p)) { return [p[0] * a.ux - p[1] * a.uz, y, p[0] * a.uz + p[1] * a.ux]; }
    function clip(poly, plane) {
      const result = [];
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length], dp = at(p, plane), dq = at(q, plane);
        if (dp <= 1e-8) result.push(p);
        if ((dp < 0) !== (dq < 0)) result.push([p[0] + (q[0] - p[0]) * dp / (dp - dq), p[1] + (q[1] - p[1]) * dp / (dp - dq)]);
      }
      return result;
    }
    const source = new THREE.ShapeGeometry(shapeOf(b.ring, b.holes)), p = source.attributes.position, index = source.index;
    for (let i = 0; i < (index?.count || p.count); i += 3) {
      const triangle = [];
      for (let j = 0; j < 3; j++) { const n = index ? index.getX(i + j) : i + j, x = p.getX(n), z = -p.getY(n); triangle.push([x * a.ux + z * a.uz, -x * a.uz + z * a.ux]); }
      for (const plane of planes) {
        let polygon = triangle;
        for (const other of planes) if (other !== plane) polygon = clip(polygon, plane.map((v, j) => v - other[j]));
        for (let j = 1; j + 1 < polygon.length; j++) {
          const q = [world(polygon[0]), world(polygon[j]), world(polygon[j + 1])], cross = (q[1][2] - q[0][2]) * (q[2][0] - q[0][0]) - (q[1][0] - q[0][0]) * (q[2][2] - q[0][2]);
          if (Math.abs(cross) > 1e-8) positions.push(...q[0], ...(cross > 0 ? q[1] : q[2]), ...(cross > 0 ? q[2] : q[1]));
        }
      }
    }
    source.dispose();
    for (const ring of [b.ring, ...b.holes]) {
      const points = toPoints(ring);
      for (let i = 0; i < points.length; i++) {
        const p = points[i], q = points[(i + 1) % points.length], u = [p.x * a.ux + p.z * a.uz, -p.x * a.uz + p.z * a.ux], v = [q.x * a.ux + q.z * a.uz, -q.x * a.uz + q.z * a.ux];
        const cuts = [0, 1];
        for (let j = 0; j < planes.length; j++) for (let k = j + 1; k < planes.length; k++) {
          const d = planes[j].map((value, index) => value - planes[k][index]), from = at(u, d), to = at(v, d), t = from / (from - to);
          if (t > 0 && t < 1) cuts.push(t);
        }
        const sorted = [...new Set(cuts)].sort((a, b) => a - b), bottom = base + l.total - l.rise;
        for (let j = 1; j < sorted.length; j++) {
          const ends = [sorted[j - 1], sorted[j]].map((t) => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t]);
          if (Math.max(...ends.map(height)) < bottom + 0.001) continue;
          const lo = world(ends[0], bottom), hi = world(ends[1], bottom), topU = world(ends[0]), topV = world(ends[1]);
          walls.push(...lo, ...hi, ...topV, ...lo, ...topV, ...topU, ...lo, ...topV, ...hi, ...lo, ...topU, ...topV);
        }
      }
    }
    for (const [values, material] of [[positions, l.roof], [walls, l.wall]]) {
      if (!values.length) continue;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(values.flatMap((v, i) => i % 3 ? [] : [v / 4, values[i + 2] / 4]), 2)); g.computeVertexNormals(); emit(group, g, material);
    }
  }
  function tower(group, p, base, height, radius, l, muslim) {
    const shaft = height * 0.72, spire = height * 0.23;
    solid(group, new THREE.CylinderGeometry(radius * 0.72, radius, shaft, 8), l.wall, p.x, base + shaft / 2, p.z);
    for (const y of [shaft * 0.68, shaft]) solid(group, new THREE.CylinderGeometry(radius * 1.12, radius * 1.12, 0.28, 8), l.trim, p.x, base + y, p.z);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, f = { x: p.x + Math.sin(a) * radius * 0.78, z: p.z + Math.cos(a) * radius * 0.78,
        nx: Math.sin(a), nz: Math.cos(a), ux: Math.cos(a), uz: -Math.sin(a), yaw: a };
      arch(group, f, 0, base + shaft * 0.77, radius * 0.63, shaft * 0.17, dark, 0.03);
    }
    lathe(group, p, base + shaft, radius, spire, muslim ? [[1, 0], [0.84, 0.28], [0.32, 0.86], [0, 1]] : [[0.6, 0], [1, 0.3], [0.9, 0.55], [0.4, 0.85], [0, 1]], muslim ? l.roof : l.dome);
    finial(group, p, base + shaft + spire, height * 0.05, muslim);
  }
  function body(group, b, base, l, mapped = false) {
    const low = l.low, towerBody = ['minaret', 'bell-tower'].includes(l.binding.role) || mapped && l.width < 7 && b.h - low > l.width * 2.6;
    if (towerBody && l.centre) { tower(group, l.centre, base + low, l.total - low, l.width / 2, l, l.binding.faith === 'mosque'); return; }
    const orthodox = l.binding.family === 'orthodox';
    const estimatedDome = !mapped && !l.mappedParts.length && l.binding.role === 'principal' &&
      (orthodox || l.binding.style.domed || /^(dome|round|onion)$/.test(b.roofShape));
    const domeHeight = estimatedDome ? Math.max(1, (b.h - low) * 0.34) : 0, top = estimatedDome ? b.h - domeHeight : l.total - l.rise;
    const g = new THREE.ExtrudeGeometry(shapeOf(b.ring, b.holes), { depth: Math.max(0.1, top - low), bevelEnabled: false });
    g.rotateX(-Math.PI / 2).translate(0, base + low, 0); splitExtrusion(group, g, l.binding.style.mappedPartsOnly && !mapped ? l.trim : l.roof, l.wall, base);
    if (!estimatedDome) {
      const roofBody = { ...b, h: l.total, roofShape: b.roofShape === 'flat' && l.rise > 0 ? 'hipped' : b.roofShape };
      if (l.rise > 0 && ['flat', 'hipped', 'gabled', 'pyramidal'].includes(b.roofShape)) planarRoof(group, b, base, l);
      else buildingRoof(group, roofBody, base, l.bounds, l.rise, l.roof);
    }
    let remaining = 40;
    for (const f of l.fs) {
      if (!low) {
        const ground = Math.min(terrainHeight(f.x, f.z), terrainHeight(f.x + f.ux * f.length / 2, f.z + f.uz * f.length / 2));
        if (ground < base) panel(group, f, 0, (ground + base) / 2, f.length, base - ground, l.wall, 0.2, 0);
      }
      panel(group, f, 0, base + top - 0.18, f.length + 0.1, 0.25, l.trim, 0.3);
      if (f.length < 2.5 || top - low < 2.5) continue;
      const bays = Math.min(8, Math.max(1, Math.floor(f.length / (l.binding.style.windowSpacing || 3.6)))), rows = Math.min(3, Math.max(1, b.levels || Math.floor((top - low) / 4)));
      for (let row = 0; row < rows; row++) for (let i = 0; i < bays && remaining > 0; i++, remaining--) {
        const u = ((i + 0.5) / bays - 0.5) * f.length, h = Math.min(3, (top - low) / rows * 0.64), w = Math.min(1.5, f.length / bays * 0.43, h * 0.7), y = base + low + (row + 0.15) * (top - low) / rows;
        arch(group, f, u, y - 0.08, w + 0.22, h + 0.18, l.trim, 0.16); arch(group, f, u, y, w, h, dark, 0.19);
      }
    }
    if (estimatedDome && l.centre) {
      const r = Math.min(l.clearance * 0.85, l.width * 0.24, domeHeight * (orthodox ? 0.42 : 0.65)), drum = domeHeight * 0.25;
      solid(group, new THREE.CylinderGeometry(r * 0.7, r * 0.7, drum, 12), l.wall, l.centre.x, base + top + drum / 2, l.centre.z);
      lathe(group, l.centre, base + top + drum, r, domeHeight * 0.6, orthodox ? [[0.5, 0], [0.85, 0.15], [1, 0.35], [0.93, 0.55], [0.55, 0.8], [0, 1]] : [[1, 0], [0.97, 0.25], [0.8, 0.6], [0.45, 0.9], [0, 1]], l.dome);
      finial(group, l.centre, base + top + domeHeight * 0.85, domeHeight * 0.15, !orthodox);
      if (orthodox && b.kind === 'cathedral' && l.width > 16) for (const a of [-1, 1]) for (const c of [-1, 1]) {
        const p = { x: l.centre.x + a * r * 1.5, z: l.centre.z + c * r * 1.5 };
        if (!pointInPoly(l.poly, p.x, p.z) || b.holes.some((h) => pointInPoly(toPoints(h), p.x, p.z))) continue;
        lathe(group, p, base + top, r * 0.45, domeHeight * 0.6, [[0.5, 0], [0.85, 0.2], [1, 0.4], [0.55, 0.8], [0, 1]], l.dome);
        finial(group, p, base + top + domeHeight * 0.6, domeHeight * 0.13, false);
      }
    }
    if (!mapped && l.binding.role === 'principal') {
      const axis = l.binding.altarAxis || { x: 0, z: 1 }, front = l.fs.reduce((a, c) => c.nx * axis.x + c.nz * axis.z < a.nx * axis.x + a.nz * axis.z ? c : a);
      if (front.length > 2 && top - low > 2.5) { arch(group, front, 0, base + low + 0.1, Math.min(2, front.length * 0.6), Math.min(3, top - low - 0.2), l.trim, 0.25); arch(group, front, 0, base + low + 0.1, Math.min(1.7, front.length * 0.5), Math.min(2.8, top - low - 0.3), dark, 0.28); }
    }
    if (l.minaret) tower(group, l.minaret, base, l.minaret.h, l.minaret.radius, l, true);
  }
  function emitBuilding(group, b, base) {
    const l = layout(b); if (!l || bindings.get(keyOf(b))?.parent) return false;
    body(group, b, base, l);
    for (const part of l.mappedParts) { const p = layout(part); if (p) body(group, part, base, p, true); }
    return true;
  }
  function ownsParts(b) { return !!layout(b)?.mappedParts.length; }
  function collisionShapes(b) {
    const l = layout(b); if (!l || bindings.get(keyOf(b))?.parent) return null;
    const shapes = [{ ...b, h: l.total, minHeight: l.low }, ...l.mappedParts];
    if (l.minaret) {
      const p = l.minaret, ring = Array.from({ length: 12 }, (_, i) => [p.x + Math.cos(i * Math.PI / 6) * p.radius, p.z + Math.sin(i * Math.PI / 6) * p.radius]).flat();
      shapes.push({ ...b, ring, holes: [], minHeight: l.total, h: p.h });
    }
    return shapes;
  }
  function massingShapes(b) {
    const shapes = collisionShapes(b); if (!shapes) return null;
    const parent = layout(b);
    return shapes.map((shape) => {
      const part = parent.mappedParts.find((p) => keyOf(p) === keyOf(shape)), l = part ? layout(part) || parent : parent;
      return { ...shape, colour: `#${l.wall.color.getHexString()}`, roofColour: `#${l.roof.color.getHexString()}`, appearance: { windows: false } };
    });
  }
  return { emitBuilding, ownsParts, collisionShapes, massingShapes };
}
