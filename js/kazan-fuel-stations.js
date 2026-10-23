import * as THREE from 'three/webgpu';
import { GEO } from './kazan-runtime.js';
import { SPAWN, groundSurfaceHeight, pointInPoly, toPoints, boundsOf } from './kazan-config.js';
import { FUEL_BRANDS } from './kazan-fuel-brands.js';

const stations = GEO.fuel?.stations || [], cells = new Map();
for (const s of stations) {
  const points = s.ring ? toPoints(s.ring) : s.canopies.flatMap((c) => toPoints(c.ring)), b = boundsOf(points);
  s.fuelBounds = b;
  for (let x = Math.floor((b.minX - 12) / 256); x <= Math.floor((b.maxX + 12) / 256); x++) {
    for (let z = Math.floor((b.minZ - 12) / 256); z <= Math.floor((b.maxZ + 12) / 256); z++) {
      const key = `${x},${z}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(s);
    }
  }
}

/** Keep procedural vegetation out of forecourts and their open vehicle lanes. */
export function fuelStationAt(x, z) {
  return (cells.get(`${Math.floor(x / 256)},${Math.floor(z / 256)}`) || []).some((s) => {
    const b = s.fuelBounds;
    return x > b.minX - 8 && x < b.maxX + 8 && z > b.minZ - 8 && z < b.maxZ + 8;
  });
}

/** A few shared boxes, thin mapped roofs and low shops suggest the citywide station network. */
export function createKazanFuelStations(draw) {
  const { plainMaterial, box, emit, flush, shapeOf, polygon, label, buildingCollider } = draw;
  const white = plainMaterial(0xe1e2da), metal = plainMaterial(0xb1b7b0, 0.25), black = plainMaterial(0x27342f);
  const glass = plainMaterial(0x3c6269, 0.2), asphalt = plainMaterial(0x555a52), curb = plainMaterial(0xa5a89b);
  const buildings = new Map(GEO.buildings.filter((b) => b.fuelRole === 'shop' && !b.part).map((b) => [`${b.osmType}/${b.id}`, b]));

  function local(f, u, v) { return { x: f.x + f.ux * u - f.uz * v, z: f.z + f.uz * u + f.ux * v }; }

  function rectangle(x, z, w, d, yaw) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].flatMap(([u, v]) => [x + cs * u + sn * v, z - sn * u + cs * v]);
  }

  function collider(ring, bottom, height, holes = []) {
    return { ...buildingCollider({ ring, holes, h: height, minHeight: 0 }, bottom), minY: bottom, maxY: bottom + height };
  }

  function slab(group, ring, holes, bottom, height, material) {
    const geometry = new THREE.ExtrudeGeometry(shapeOf(ring, holes), { depth: height, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2).translate(0, bottom, 0);
    emit(group, geometry, material);
  }

  function pump(group, p, f, palette, colliders) {
    const ground = groundSurfaceHeight(p.x, p.z), yaw = -Math.atan2(f.uz, f.ux);
    const paint = plainMaterial(palette.pump), accent = plainMaterial(palette.accent);
    box(group, p.x, ground + 0.08, p.z, 1.35, 0.16, 2.45, curb, yaw);
    box(group, p.x, ground + 0.63, p.z, 0.92, 1.1, 0.62, paint, yaw);
    box(group, p.x, ground + 1.55, p.z, 1.05, 0.8, 0.68, white, yaw);
    for (const side of [-1, 1]) {
      const screen = local({ ...f, x: p.x, z: p.z }, 0, side * 0.355);
      box(group, screen.x, ground + 1.58, screen.z, 0.52, 0.3, 0.035, black, yaw);
      for (const u of [-0.56, 0.56]) {
        const hose = local({ ...f, x: p.x, z: p.z }, u, side * 0.25);
        box(group, hose.x, ground + 0.89, hose.z, 0.055, 1.1, 0.055, black);
        box(group, hose.x, ground + 1.38, hose.z, 0.11, 0.23, 0.12, accent, yaw);
      }
    }
    box(group, p.x, ground + 2.01, p.z, 1.1, 0.17, 0.75, accent, yaw);
    colliders.push(collider(rectangle(p.x, p.z, 1.05, 0.75, yaw), ground + 0.12, 2));
  }

  function canopy(group, c, palette, colliders) {
    const poly = toPoints(c.ring), base = Math.max(...poly.map((p) => groundSurfaceHeight(p.x, p.z))) + c.clearance;
    const paint = plainMaterial(palette.fascia), accent = plainMaterial(palette.accent), secondary = plainMaterial(palette.secondary), column = plainMaterial(palette.column);
    slab(group, c.ring, c.holes, base, 0.6, paint);
    slab(group, c.ring, c.holes, base - 0.05, 0.055, metal);
    colliders.push(collider(c.ring, base - 0.05, 0.65, c.holes));
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], length = Math.hypot(b.x - a.x, b.z - a.z);
      box(group, (a.x + b.x) / 2, base + 0.09, (a.z + b.z) / 2, length, 0.15, 0.08, accent, -Math.atan2(b.z - a.z, b.x - a.x));
      box(group, (a.x + b.x) / 2, base + 0.54, (a.z + b.z) / 2, length, 0.08, 0.09, secondary, -Math.atan2(b.z - a.z, b.x - a.x));
    }
    const yaw = -Math.atan2(c.uz, c.ux), used = new Set();
    for (const p of c.pumps) {
      const post = local({ ...c, ...c.pumpAxis, x: p.x, z: p.z }, 0, 1.45);
      if (!pointInPoly(poly, post.x, post.z) || c.holes.some((h) => pointInPoly(toPoints(h), post.x, post.z))) continue;
      const key = `${Math.round(post.x)},${Math.round(post.z)}`;
      if (used.has(key)) continue;
      used.add(key);
      const bottom = groundSurfaceHeight(post.x, post.z), height = base - bottom;
      box(group, post.x, bottom + height / 2, post.z, 0.55, height, 0.65, column, yaw);
      box(group, post.x, bottom + 0.34, post.z, 0.64, 0.68, 0.73, accent, yaw);
      colliders.push(collider(rectangle(post.x, post.z, 0.64, 0.73, yaw), bottom, height));
    }
    if (!used.size) {
      for (const u of [-c.w * 0.3, c.w * 0.3]) {
        const post = local(c, u, 0);
        if (!pointInPoly(poly, post.x, post.z)) continue;
        const bottom = groundSurfaceHeight(post.x, post.z), height = base - bottom;
        box(group, post.x, bottom + height / 2, post.z, 0.55, height, 0.65, column, yaw);
        colliders.push(collider(rectangle(post.x, post.z, 0.55, 0.65, yaw), bottom, height));
      }
    }
    for (const side of [-1, 1]) {
      const p = local(c, 0, side * (c.d / 2 + 0.07)), width = Math.min(10, c.w * 0.62), signYaw = Math.atan2(-c.uz * side, c.ux * side);
      if (palette.name === 'TEBOIL') box(group, p.x, base + 0.34, p.z, width + 0.5, 0.47, 0.08, accent, yaw);
      label(group, palette.name, p.x, base + 0.33, p.z, width, 0.43, signYaw, palette.text);
    }
  }

  function shop(group, s, shop, palette, colliders) {
    const b = buildings.get(shop.id);
    if (!b) return;
    const points = toPoints(b.ring), base = Math.max(...points.map((p) => groundSurfaceHeight(p.x, p.z)));
    const h = /osm-height|osm-levels|published-height/.test(b.heightSource) ? Math.min(8, b.h) : 3.8;
    slab(group, b.ring, b.holes, base - 0.3, h + 0.3, white);
    slab(group, b.ring, b.holes, base + h, 0.35, plainMaterial(palette.fascia));
    const bottom = Math.min(...points.map((p) => groundSurfaceHeight(p.x, p.z))) - 0.2;
    colliders.push(collider(b.ring, bottom, base + h + 0.35 - bottom, b.holes));
    const c = s.canopies[0];
    let front = null, distance = Infinity;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length], d = Math.hypot((a.x + b.x) / 2 - c.x, (a.z + b.z) / 2 - c.z);
      if (d < distance) { distance = d; front = [a, b]; }
    }
    const [a, d] = front, length = Math.hypot(d.x - a.x, d.z - a.z), yaw = -Math.atan2(d.z - a.z, d.x - a.x);
    const x = (a.x + d.x) / 2, z = (a.z + d.z) / 2;
    box(group, x, base + h * 0.46, z, length * 0.88, h * 0.7, 0.14, glass, yaw);
    box(group, x, base + h - 0.25, z, length, 0.32, 0.2, plainMaterial(palette.accent), yaw);
    const count = Math.max(1, Math.round(length / 2.6));
    for (let i = 0; i <= count; i++) box(group, a.x + (d.x - a.x) * i / count, base + h * 0.46, a.z + (d.z - a.z) * i / count, 0.08, h * 0.74, 0.19, metal, yaw);
  }

  function build(parent, initialPosition = SPAWN) {
    const group = new THREE.Group(); group.name = 'KazanFuelStations';
    const colliders = [], regions = new Map();
    function region(x, z) {
      const ix = Math.floor(x / 2048), iz = Math.floor(z / 2048), key = `${ix},${iz}`;
      if (!regions.has(key)) {
        const tile = new THREE.Group(); tile.name = `KazanFuelRegion/${key}`;
        group.add(tile); regions.set(key, { group: tile, x: (ix + 0.5) * 2048, z: (iz + 0.5) * 2048 });
      }
      return regions.get(key).group;
    }
    for (const s of stations) {
      const palette = FUEL_BRANDS[s.brand.family] || FUEL_BRANDS.neutral, tile = region(s.x, s.z);
      if (s.ring) polygon(s.ring, (x, z) => groundSurfaceHeight(x, z) + 0.02, asphalt, tile);
      for (const c of s.canopies) canopy(tile, c, palette, colliders);
      for (const p of s.pumps) {
        const c = s.canopies.find((c) => c.pumps.some((v) => v.id === p.id)) || s.canopies[0];
        pump(tile, p, c.pumpAxis || c, palette, colliders);
      }
      for (const b of s.shops) shop(tile, s, b, palette, colliders);
    }
    for (const p of GEO.fuel?.unassignedPumps || []) pump(region(p.x, p.z), p, { ux: 1, uz: 0 }, FUEL_BRANDS.neutral, colliders);
    for (const tile of regions.values()) flush(tile.group);
    let cell = '';
    function update(x, z) {
      const next = `${Math.floor(x / 256)},${Math.floor(z / 256)}`;
      if (cell === next) return;
      cell = next;
      for (const tile of regions.values()) tile.group.visible = Math.hypot(Math.max(0, Math.abs(x - tile.x) - 1120), Math.max(0, Math.abs(z - tile.z) - 1120)) < 2400;
    }
    update(initialPosition.x, initialPosition.z); parent.add(group);
    return { colliders, update };
  }
  return { build };
}
