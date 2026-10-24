import * as THREE from 'three/webgpu';
import { GEO, services } from './kazan-runtime.js';
import { toPoints, pointInPoly, groundSurfaceHeight } from './kazan-config.js';
import { createKazanOpenStadiums } from './kazan-open-stadiums.js';

const keyOf = (b) => `${b.osmType}/${b.id}`;

/** Indoor spectator halls share their envelope; reviewed landmarks supply only proportions and identifying accents. */
export function createKazanSportsModels(draw) {
  const openStadiums = createKazanOpenStadiums(draw);
  const { plainMaterial, box, solid, emit, shapeOf, splitExtrusion, pitchedRoof, buildingRoof, roofMaterial, label } = draw;
  const bindings = new Map((GEO.sports?.bindings || []).map((b) => [b.reference, b]));
  const buildings = new Map(GEO.buildings.map((b) => [keyOf(b), b]));
  const wall = plainMaterial(0xd6cdb8), trim = plainMaterial(0xe3ded0), plinth = plainMaterial(0x888c86);
  const glass = plainMaterial(0x2c526b, 0.28), dark = plainMaterial(0x223b4b, 0.22), metal = plainMaterial(0x8c9596, 0.35);
  const orange = plainMaterial(0xd97c25), seam = plainMaterial(0x503d2e), layouts = new Map();

  function faces(b) {
    const source = toPoints(b.ring).map((p, index) => ({ ...p, index }));
    const poly = source.filter((p, i) => {
      const a = source[(i + source.length - 1) % source.length], c = source[(i + 1) % source.length];
      const ux = p.x - a.x, uz = p.z - a.z, vx = c.x - p.x, vz = c.z - p.z;
      return ux * vx + uz * vz <= 0 || Math.abs(ux * vz - uz * vx) / (Math.hypot(ux, uz) * Math.hypot(vx, vz) || 1) > 0.005;
    }), result = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], c = poly[(i + 1) % poly.length], length = Math.hypot(c.x - a.x, c.z - a.z);
      if (length < 0.5) continue;
      const ux = (c.x - a.x) / length, uz = (c.z - a.z) / length, x = (a.x + c.x) / 2, z = (a.z + c.z) / 2;
      let nx = -uz, nz = ux;
      if (pointInPoly(poly, x + nx * 0.1, z + nz * 0.1)) { nx = -nx; nz = -nz; }
      result.push({ index: a.index, x, z, ux, uz, nx, nz, length, yaw: -Math.atan2(uz, ux) });
    }
    return result;
  }

  function panel(group, f, u, y, width, height, depth, projection, material) {
    box(group, f.x + f.ux * u + f.nx * projection, y, f.z + f.uz * u + f.nz * projection, width, height, depth, material, f.yaw);
  }

  function volume(group, b, base, height, material, cap = metal) {
    const geometry = new THREE.ExtrudeGeometry(shapeOf(b.ring, b.holes), { depth: height - (b.minHeight || 0), bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2).translate(0, base + (b.minHeight || 0), 0);
    splitExtrusion(group, geometry, cap, material, base);
    if (!b.minHeight) for (const f of faces(b)) {
      const ground = Math.min(...[-0.48, 0, 0.48].map((u) => groundSurfaceHeight(f.x + f.ux * f.length * u + f.nx * 0.15, f.z + f.uz * f.length * u + f.nz * 0.15)));
      if (ground < base) panel(group, f, 0, (ground + base) / 2, f.length, base - ground, 0.25, 0.02, plinth);
    }
  }

  function facetedRoof(group, b, y, rise, overhang) {
    const pts = toPoints(b.ring), x = pts.reduce((n, p) => n + p.x, 0) / pts.length, z = pts.reduce((n, p) => n + p.z, 0) / pts.length;
    const radius = Math.max(...pts.map((p) => Math.hypot(p.x - x, p.z - z))), positions = [];
    const rings = [[1 + overhang / radius, y], [0.78, y + rise * 0.82], [0.55, y + rise]];
    for (let tier = 0; tier < rings.length - 1; tier++) for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length], lo = rings[tier], hi = rings[tier + 1];
      const p = [x + (a.x - x) * lo[0], lo[1], z + (a.z - z) * lo[0]], q = [x + (c.x - x) * lo[0], lo[1], z + (c.z - z) * lo[0]],
        r = [x + (c.x - x) * hi[0], hi[1], z + (c.z - z) * hi[0]], s = [x + (a.x - x) * hi[0], hi[1], z + (a.z - z) * hi[0]];
      positions.push(...p, ...q, ...r, ...p, ...r, ...s);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals();
    const normal = geometry.attributes.normal;
    if (normal.getY(0) < 0) { for (let i = 0; i < positions.length; i += 9) positions.splice(i, 9, ...positions.slice(i, i + 3), ...positions.slice(i + 6, i + 9), ...positions.slice(i + 3, i + 6)); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals(); }
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
    emit(group, geometry, metal);
    const cap = pts.flatMap((p) => [x + (p.x - x) * 0.55, z + (p.z - z) * 0.55]);
    const top = new THREE.ShapeGeometry(shapeOf(cap)); top.rotateX(-Math.PI / 2).translate(0, y + rise, 0); emit(group, top, metal);
  }

  function basketball(group, x, y, z) {
    solid(group, new THREE.SphereGeometry(0.95, 16, 10), orange, x, y, z);
    for (const axis of [0, 1]) {
      const ring = new THREE.TorusGeometry(0.955, 0.025, 3, 24);
      if (axis) ring.rotateY(Math.PI / 2);
      solid(group, ring, seam, x, y, z);
    }
  }

  function entryLayout(b, appearance) {
    if (!appearance?.entry || keyOf(b) !== appearance.main) return null;
    if (layouts.has(keyOf(b))) return layouts.get(keyOf(b));
    const f = faces(b).find((f) => f.index === appearance.entry.face);
    if (!f) return null;
    const entry = { ...f, ...appearance.entry, base: groundSurfaceHeight(f.x + f.nx * appearance.entry.depth, f.z + f.nz * appearance.entry.depth) };
    layouts.set(keyOf(b), entry); return entry;
  }

  function hall(group, b, base, appearance, main = false) {
    const entry = entryLayout(b, appearance), rise = main ? appearance.roofRise : b.roofHeight || 0;
    const envelope = appearance?.wallColour ? plainMaterial(appearance.wallColour) : wall;
    const cap = appearance?.roofColour ? plainMaterial(appearance.roofColour) : metal;
    const eaves = Math.max((b.minHeight || 0) + 1, b.h - rise), bands = main ? 3 : Math.max(1, Math.min(3, b.levels || Math.floor(eaves / 3.5)));
    volume(group, b, base, eaves, envelope);
    for (const f of faces(b)) {
      panel(group, f, 0, base + 0.4, f.length, 0.8, 0.18, 0.06, plinth);
      if (f.length < 4) continue;
      const clear = f.length - (main ? 6 : 2), bottom = appearance?.glazingBottom ?? (main ? 1.2 : 1), top = appearance?.glazingTop ?? (main ? eaves - 4.3 : eaves - 1.3);
      if (clear > 1 && top > bottom) {
        panel(group, f, 0, base + (bottom + top) / 2, clear, top - bottom, 0.12, 0.08, glass);
        for (let row = 1; row < bands; row++) panel(group, f, 0, base + bottom + (top - bottom) * row / bands, clear, main ? 0.5 : 0.2, 0.2, 0.15, dark);
        const bays = Math.ceil(clear / 2.2);
        for (let i = 0; i <= bays; i++) panel(group, f, -clear / 2 + i * clear / bays, base + (bottom + top) / 2, 0.045, top - bottom, 0.14, 0.17, dark);
      }
      for (const side of [-1, 1]) {
        const u = side * (f.length / 2 - (main ? 1.5 : 0.45));
        panel(group, f, u, base + (eaves - (main ? 2.4 : 0.5)) / 2, main ? 2.7 : 0.65, eaves - (main ? 2.4 : 0.5), main ? 1.1 : 0.3, main ? 0.42 : 0.1, trim);
        if (main) panel(group, f, u, base + eaves * 0.4, 0.42, eaves * 0.56, 0.12, 1.02, dark);
      }
      if (main) {
        panel(group, f, 0, base + eaves - 3.2, f.length + 0.4, 2.1, 1.6, 0.55, wall);
        panel(group, f, 0, base + eaves - 1.15, f.length + 0.3, 1.8, 0.15, 0.12, dark);
        panel(group, f, 0, base + eaves - 0.1, f.length + 1, 0.2, 1.5, 0.45, metal);
        basketball(group, f.x - f.ux * (f.length / 2 - 1.6) + f.nx * 0.85,
          base + eaves - 1.65, f.z - f.uz * (f.length / 2 - 1.6) + f.nz * 0.85);
      }
    }
    if (main) facetedRoof(group, b, base + eaves, rise, appearance.overhang);
    else if (rise > 0) pitchedRoof(group, b, base, rise, cap);
    if (entry) {
      for (let i = 0; i < entry.steps; i++) {
        const depth = entry.depth * (entry.steps - i) / entry.steps, h = entry.rise * (i + 1) / entry.steps;
        panel(group, entry, 0, entry.base + h / 2, entry.width, h, depth, depth / 2, plinth);
      }
      panel(group, entry, 0, entry.base + entry.rise + 1.35, 5.2, 2.7, 0.16, 0.18, dark);
      for (const u of [-2.6, -1.3, 0, 1.3, 2.6]) panel(group, entry, u, entry.base + entry.rise + 1.35, 0.1, 2.7, 0.25, 0.3, metal);
      panel(group, entry, 0, entry.base + entry.rise + 2.85, 6.5, 0.24, 1.9, 0.8, trim);
      if (main || appearance.signText) label(group, appearance.signText || 'БАСКЕТ-ХОЛЛ', entry.x + entry.nx * 1.38, base + eaves - 3.15,
        entry.z + entry.nz * 1.38, appearance.signWidth || 15, 1.5, Math.atan2(entry.nx, entry.nz), '#e8e6d9');
    }
  }

  function emitBuilding(group, b, base) {
    if (openStadiums.emitBuilding(group, b, base)) return true;
    const binding = bindings.get(keyOf(b));
    if (!binding || b.model && b.model !== 'indoor-arena') return false;
    if (b.model === 'indoor-arena' && binding.appearance) {
      for (const ref of binding.appearance.components) {
        const part = buildings.get(ref);
        if (part) hall(group, part, base, binding.appearance, binding.appearance.variant === 'basket-hall' && ref === binding.appearance.main);
      }
      return true;
    }
    if (!['indoor-arena', 'indoor-pool', 'sports-hall', 'fitness', 'grandstand'].includes(binding.family) ||
      !['sports-body', 'mapped-part'].includes(binding.role) || b.appearance || ['school', 'kindergarten'].includes(binding.context)) return false;
    if (binding.family === 'grandstand') grandstand(group, b, base);
    else genericHall(group, b, base, binding.family);
    return true;
  }

  function genericHall(group, b, base, family) {
    const colour = b.colour && (/^#[0-9a-f]{3,6}$/i.test(b.colour) || b.colour.toLowerCase() in THREE.Color.NAMES) ? new THREE.Color(b.colour).getHex() :
      /brick/.test(b.material) ? 0xad7860 : /wood|timber/.test(b.material) ? 0x9b8062 : 0xd0d4cc;
    const envelope = plainMaterial(colour), cap = roofMaterial(b), poly = toPoints(b.ring);
    const xs = poly.map((p) => p.x), zs = poly.map((p) => p.z), bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
    const curved = /dome|onion|round|pyramidal|hipped|gabled|barrel/.test(b.roofShape);
    const rise = curved ? Math.min(b.h - (b.minHeight || 0) - 0.2, b.roofHeight || Math.min(6, b.h * 0.3)) : 0;
    const eaves = b.h - rise;
    volume(group, b, base, eaves, envelope, cap);
    buildingRoof(group, b, base, bounds, rise, cap);
    for (const f of faces(b)) {
      if (f.length < 4 || eaves - (b.minHeight || 0) < 2.5) continue;
      const bottom = Math.max(b.minHeight || 0, family === 'indoor-pool' ? 2 : 1.2), top = eaves - 0.8;
      if (top - bottom < 0.6) continue;
      const width = f.length - 1.6;
      panel(group, f, 0, base + (top + bottom) / 2, width, top - bottom, 0.1, 0.09, glass);
      const bays = Math.min(12, Math.ceil(width / 4));
      for (let i = 0; i <= bays; i++) panel(group, f, (i / bays - 0.5) * width, base + (top + bottom) / 2, 0.12, top - bottom, 0.16, 0.16, trim);
      const rows = Math.min(3, Math.max(1, b.levels || Math.floor((top - bottom) / 4)));
      for (let i = 1; i < rows; i++) panel(group, f, 0, base + bottom + (top - bottom) * i / rows, width, 0.3, 0.17, 0.17, envelope);
      panel(group, f, 0, base + eaves - 0.25, f.length, 0.5, 0.3, 0.08, family === 'indoor-pool' ? glass : cap);
    }
  }

  function grandstand(group, b, base) {
    const fs = faces(b), front = fs.reduce((a, f) => f.length > a.length ? f : a), poly = toPoints(b.ring);
    const depths = poly.map((p) => (p.x - front.x) * -front.nx + (p.z - front.z) * -front.nz);
    const min = Math.min(...depths), max = Math.max(...depths), tiers = Math.max(3, Math.min(16, Math.ceil(b.h / 0.7)));
    function clip(input, threshold, keepHigh) {
      const result = [];
      for (let i = 0; i < input.length; i++) {
        const a = input[i], c = input[(i + 1) % input.length];
        const da = (a.x - front.x) * -front.nx + (a.z - front.z) * -front.nz - threshold;
        const dc = (c.x - front.x) * -front.nx + (c.z - front.z) * -front.nz - threshold;
        if (keepHigh ? da >= 0 : da <= 0) result.push(a);
        if ((da < 0) !== (dc < 0)) result.push({ x: a.x + (c.x - a.x) * da / (da - dc), z: a.z + (c.z - a.z) * da / (da - dc) });
      }
      return result;
    }
    for (let i = 0; i < tiers; i++) {
      const strip = clip(clip(poly, min + (max - min) * i / tiers, true), min + (max - min) * (i + 1) / tiers, false);
      if (strip.length < 3) continue;
      const geometry = new THREE.ExtrudeGeometry(shapeOf(strip.flatMap((p) => [p.x, p.z])), { depth: b.h * (i + 1) / tiers, bevelEnabled: false });
      geometry.rotateX(-Math.PI / 2).translate(0, base, 0); splitExtrusion(group, geometry, i % 2 ? glass : trim, plinth, base);
    }
  }

  function collisionShapes(b) {
    const open = openStadiums.collisionShapes(b); if (open) return open;
    const appearance = bindings.get(keyOf(b))?.appearance;
    return b.model === 'indoor-arena' && appearance ? appearance.components.map((ref) => buildings.get(ref)).filter(Boolean) : null;
  }

  function surfaceHeight(x, z, referenceY, height) {
    height = openStadiums.surfaceHeight(x, z, referenceY, height);
    for (const binding of entries) {
      const b = buildings.get(binding.reference), entry = b && entryLayout(b, binding.appearance);
      if (!entry || entry.steps < 1) continue;
      const dx = x - entry.x, dz = z - entry.z, u = dx * entry.ux + dz * entry.uz, d = dx * entry.nx + dz * entry.nz;
      if (Math.abs(u) > entry.width / 2 || d < 0 || d > entry.depth) continue;
      const step = Math.min(entry.steps, Math.max(1, Math.ceil((1 - d / entry.depth) * entry.steps)));
      const candidate = entry.base + entry.rise * step / entry.steps;
      if (!Number.isFinite(referenceY) || referenceY >= candidate - 0.5 && referenceY <= candidate + 2.5) height = Math.max(height, candidate);
    }
    return height;
  }

  const entries = [...bindings.values()].filter((b) => b.appearance && b.reference === b.appearance.main);
  services.sportsSurfaceHeight = surfaceHeight;
  return { emitBuilding, collisionShapes };
}
