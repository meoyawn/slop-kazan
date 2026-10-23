import * as THREE from 'three/webgpu';
import { GEO, services } from './kazan-runtime.js';
import { ROADS, SPAWN, terrainHeight, buildingAt, waterAt, nearestRoads, toPoints, boundsOf, pointInPoly } from './kazan-config.js';
import { buildCarProxyGeometry, BODY_SPECS, createLoftedCarMaterial } from './actor-models.js';
import { createRoadSurfaceMaterial } from './tsl-materials.js';

const RADIUS = 650, LOT_LIMIT = 24, CACHE_LIMIT = 36, SLOT_LIMIT = 4000, CAR_LIMIT = 64;

function parkingHash(x, z, salt = 0) {
  let n = Math.imul(Math.round(x * 10), 374761393) ^ Math.imul(Math.round(z * 10), 668265263) ^ Math.imul(salt, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Bounded, stationary parking scenery follows mapped lots and aisles, separately from the driving graph. */
export function createKazanParking() {
  const group = new THREE.Group(); group.name = 'KazanParking';
  const lots = (GEO.parkings || []).map((p) => ({ ...p, key: `${p.osmType}/${p.id}`, polygons: p.rings.map(toPoints), inner: p.holes.map(toPoints) }));
  const cache = new Map(), aisleGrid = new Map(), colliders = [];
  for (const road of ROADS.filter((r) => r.parking)) for (let i = 1; i < road.pts.length; i++) {
    const a = road.pts[i - 1], b = road.pts[i], length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 9) continue;
    const segment = { a, b, length, w: road.w, marked: road.service === 'parking_aisle' };
    for (let x = Math.floor(Math.min(a.x, b.x) / 128); x <= Math.floor(Math.max(a.x, b.x) / 128); x++) {
      for (let z = Math.floor(Math.min(a.z, b.z) / 128); z <= Math.floor(Math.max(a.z, b.z) / 128); z++) {
        const key = `${x},${z}`;
        if (!aisleGrid.has(key)) aisleGrid.set(key, []);
        aisleGrid.get(key).push(segment);
      }
    }
  }
  const asphalt = createRoadSurfaceMaterial();
  const gravel = new THREE.MeshStandardNodeMaterial({ color: 0x8c8a7d, roughness: 1 });
  const paint = new THREE.MeshStandardNodeMaterial({ color: 0xc8c6b7, roughness: 0.9 });
  const markings = new THREE.Mesh(new THREE.BufferGeometry(), paint);
  markings.name = 'ParkingBayMarkings'; markings.visible = false; markings.receiveShadow = true; group.add(markings);
  const carGeometry = buildCarProxyGeometry(BODY_SPECS.sedan);
  carGeometry.setAttribute('paintColor', new THREE.InstancedBufferAttribute(new Float32Array(CAR_LIMIT * 3), 3));
  carGeometry.setAttribute('carState', new THREE.InstancedBufferAttribute(new Float32Array(CAR_LIMIT * 4), 4));
  const cars = new THREE.InstancedMesh(carGeometry, createLoftedCarMaterial(BODY_SPECS.sedan), CAR_LIMIT);
  cars.name = 'ParkedCars'; cars.count = 0; cars.visible = false; cars.receiveShadow = true; group.add(cars);
  const dummy = new THREE.Object3D(), tint = new THREE.Color(), palette = [0xd5d8d7, 0x474c50, 0x274457, 0x8c3832, 0xa6abad];
  let wanted = [], queue = [], current = null, worker = null, lastCell = '';

  function within(lot, x, z) {
    return lot.polygons.some((p) => pointInPoly(p, x, z)) && !lot.inner.some((p) => pointInPoly(p, x, z));
  }

  function lotAisles(lot) {
    const found = new Set(), b = lot.bounds;
    for (let x = Math.floor(b.minX / 128); x <= Math.floor(b.maxX / 128); x++) {
      for (let z = Math.floor(b.minZ / 128); z <= Math.floor(b.maxZ / 128); z++) {
        for (const s of aisleGrid.get(`${x},${z}`) || []) if (s.marked) found.add(s);
      }
    }
    return [...found].filter((s) => within(lot, (s.a.x + s.b.x) / 2, (s.a.z + s.b.z) / 2)).sort((a, b) => b.length - a.length);
  }

  function* candidates(lot) {
    const aisles = lotAisles(lot);
    if (aisles.length) {
      for (const s of aisles) {
        const ux = (s.b.x - s.a.x) / s.length, uz = (s.b.z - s.a.z) / s.length;
        for (let along = 4; along < s.length - 4; along += 2.7) for (const side of [-1, 1]) {
          yield { x: s.a.x + ux * along - uz * side * (s.w / 2 + 2.9), z: s.a.z + uz * along + ux * side * (s.w / 2 + 2.9), ux, uz, backSide: side };
        }
      }
    } else {
      const poly = lot.polygons[0];
      let longest = 0, ux = 1, uz = 0;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length > longest) { longest = length; ux = (b.x - a.x) / length; uz = (b.z - a.z) / length; }
      }
      const projected = lot.polygons.flat().map((p) => ({ x: p.x * ux + p.z * uz, z: -p.x * uz + p.z * ux })), b = boundsOf(projected);
      for (let v = Math.ceil(b.minZ / 16) * 16; v < b.maxZ; v += 16) for (const row of [2.5, 13.5]) {
        for (let u = Math.ceil(b.minX / 2.7) * 2.7; u < b.maxX; u += 2.7) yield { x: u * ux - (v + row) * uz, z: u * uz + (v + row) * ux, ux, uz, backSide: row < 8 ? -1 : 1 };
      }
    }
  }

  function* layout(lot) {
    const occupied = new Map();
    let count = 0, attempts = 0;
    for (const s of candidates(lot)) {
      if (++attempts > 20000 || count >= 2500) break;
      const nx = -s.uz, nz = s.ux;
      let valid = within(lot, s.x, s.z) && !buildingAt(s.x, s.z) && !waterAt(s.x, s.z);
      if (valid && nearestRoads(s.x, s.z, 24).some((p) => p.dist < p.road.w / 2 + 2.7)) valid = false;
      const heights = [];
      for (const u of [-1.25, 1.25]) for (const v of [-2.5, 2.5]) {
        const x = s.x + s.ux * u + nx * v, z = s.z + s.uz * u + nz * v;
        if (!within(lot, x, z) || buildingAt(x, z) || waterAt(x, z)) valid = false;
        heights.push(terrainHeight(x, z));
      }
      if (Math.max(...heights) - Math.min(...heights) > 0.55) valid = false;
      const ix = Math.floor(s.x / 6), iz = Math.floor(s.z / 6);
      if (valid) for (let x = ix - 1; x <= ix + 1; x++) for (let z = iz - 1; z <= iz + 1; z++) {
        for (const p of occupied.get(`${x},${z}`) || []) {
          const dx = s.x - p.x, dz = s.z - p.z;
          if (Math.abs(dx * s.ux + dz * s.uz) < 2.55 && Math.abs(-dx * s.uz + dz * s.ux) < 4.95) valid = false;
        }
      }
      if (!valid) { yield null; continue; }
      const key = `${ix},${iz}`;
      if (!occupied.has(key)) occupied.set(key, []);
      occupied.get(key).push(s); count++;
      yield s;
    }
  }

  function surface(lot) {
    const vertices = [];
    for (const poly of lot.polygons) {
      const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, -p.z)));
      for (const hole of lot.inner) if (pointInPoly(poly, hole[0].x, hole[0].z)) shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, -p.z))));
      const source = new THREE.ShapeGeometry(shape).toNonIndexed(); source.rotateX(-Math.PI / 2);
      const p = source.attributes.position, pending = [];
      for (let i = 0; i < p.count; i += 3) pending.push([0, 1, 2].map((j) => [p.getX(i + j), p.getZ(i + j)]));
      while (pending.length) {
        const t = pending.pop();
        let edge = 0, longest = 0;
        for (let i = 0; i < 3; i++) {
          const a = t[i], b = t[(i + 1) % 3], d = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
          if (d > longest) { longest = d; edge = i; }
        }
        const a = t[edge], b = t[(edge + 1) % 3], c = t[(edge + 2) % 3];
        if (longest > 64) {
          const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; pending.push([a, mid, c], [mid, b, c]);
        } else for (const [x, z] of t) vertices.push(x, terrainHeight(x, z) + 0.075, z);
      }
      source.dispose();
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, /gravel|unpaved|ground|dirt/.test(lot.surface) ? gravel : asphalt);
    mesh.name = `ParkingSurface/${lot.key}`; mesh.receiveShadow = true; group.add(mesh);
    return mesh;
  }

  function paintLine(vertices, ax, az, bx, bz) {
    const length = Math.hypot(bx - ax, bz - az), nx = (az - bz) / length * 0.055, nz = (bx - ax) / length * 0.055;
    const corners = [[ax - nx, az - nz], [ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz]];
    for (const i of [0, 1, 2, 0, 2, 3]) { const [x, z] = corners[i]; vertices.push(x, terrainHeight(x, z) + 0.11, z); }
  }

  function trimCache() {
    for (const [key, record] of cache) if (cache.size > CACHE_LIMIT && !wanted.includes(record.lot)) {
      group.remove(record.mesh); record.mesh.geometry.dispose(); cache.delete(key);
    }
  }

  function rebuild() {
    const vertices = [], selected = [];
    let slots = 0, visible = 0;
    trimCache();
    for (const record of cache.values()) record.mesh.visible = wanted.includes(record.lot);
    for (const lot of wanted) {
      const record = cache.get(lot.key);
      if (!record) continue;
      visible++;
      for (const s of record.slots) {
        if (slots++ >= SLOT_LIMIT) break;
        const nx = -s.uz, nz = s.ux;
        for (const side of [-1, 1]) paintLine(vertices, s.x + s.ux * side * 1.3 - nx * 2.5, s.z + s.uz * side * 1.3 - nz * 2.5,
          s.x + s.ux * side * 1.3 + nx * 2.5, s.z + s.uz * side * 1.3 + nz * 2.5);
        paintLine(vertices, s.x - s.ux * 1.3 + nx * 2.5 * s.backSide, s.z - s.uz * 1.3 + nz * 2.5 * s.backSide,
          s.x + s.ux * 1.3 + nx * 2.5 * s.backSide, s.z + s.uz * 1.3 + nz * 2.5 * s.backSide);
      }
      const candidates = record.slots.slice().sort((a, b) => parkingHash(a.x, a.z, lot.id) - parkingHash(b.x, b.z, lot.id));
      selected.push(...candidates.slice(0, Math.min(6, Math.max(1, Math.floor(record.slots.length / 100)))));
    }
    markings.geometry.dispose(); markings.geometry = new THREE.BufferGeometry();
    markings.geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); markings.geometry.computeVertexNormals(); markings.visible = vertices.length > 0;
    colliders.length = 0; cars.count = 0;
    for (const s of selected.slice(0, CAR_LIMIT)) {
      const angle = Math.atan2(-s.uz, s.ux) + (parkingHash(s.x, s.z, 2) > 0.5 ? Math.PI : 0), y = terrainHeight(s.x, s.z) + 0.09;
      const fx = Math.sin(angle), fz = Math.cos(angle), rx = Math.cos(angle), rz = -Math.sin(angle);
      const pitch = Math.atan((terrainHeight(s.x + fx * 2, s.z + fz * 2) - terrainHeight(s.x - fx * 2, s.z - fz * 2)) / 4);
      const roll = Math.atan((terrainHeight(s.x + rx, s.z + rz) - terrainHeight(s.x - rx, s.z - rz)) / 2);
      dummy.position.set(s.x, y, s.z); dummy.rotation.set(-pitch, angle, roll, 'YXZ'); dummy.updateMatrix(); cars.setMatrixAt(cars.count, dummy.matrix);
      tint.setHex(palette[Math.floor(parkingHash(s.x, s.z, 3) * palette.length)]); carGeometry.attributes.paintColor.setXYZ(cars.count, tint.r, tint.g, tint.b);
      const hx = Math.abs(rx) + Math.abs(fx) * 2.3, hz = Math.abs(rz) + Math.abs(fz) * 2.3;
      colliders.push({ minX: s.x - hx, maxX: s.x + hx, minZ: s.z - hz, maxZ: s.z + hz, minY: y - 0.1, maxY: y + 1.6,
        obb: { cx: s.x, cz: s.z, hx: 1, hz: 2.3, cs: rx, sn: fx } });
      cars.count++;
    }
    cars.visible = cars.count > 0; cars.instanceMatrix.needsUpdate = true; carGeometry.attributes.paintColor.needsUpdate = true; cars.computeBoundingSphere();
    group.userData.parking = { visibleLots: visible, cachedLots: cache.size, slots: Math.min(slots, SLOT_LIMIT), cars: cars.count, carLimit: CAR_LIMIT, radius: RADIUS };
  }

  function work() {
    const deadline = performance.now() + 10;
    while (performance.now() < deadline) {
      if (!current) {
        const lot = queue.shift();
        if (!lot) { worker = null; rebuild(); return; }
        if (!wanted.includes(lot) || cache.has(lot.key)) continue;
        current = { lot, generator: layout(lot), slots: [] };
      }
      if (!wanted.includes(current.lot)) { current = null; continue; }
      const step = current.generator.next();
      if (step.done) {
        cache.set(current.lot.key, { lot: current.lot, slots: current.slots, mesh: surface(current.lot) }); current = null; trimCache();
      } else if (step.value) current.slots.push(step.value);
    }
    worker = setTimeout(work, 0);
  }

  function update(camera) {
    const p = camera.position || camera, cell = `${Math.floor(p.x / 128)},${Math.floor(p.z / 128)}`;
    if (cell === lastCell) return;
    lastCell = cell;
    function distance(lot) { const b = lot.bounds; return Math.hypot(Math.max(b.minX - p.x, 0, p.x - b.maxX), Math.max(b.minZ - p.z, 0, p.z - b.maxZ)); }
    wanted = lots.filter((lot) => distance(lot) < RADIUS).sort((a, b) => distance(a) - distance(b)).slice(0, LOT_LIMIT);
    for (const [key, record] of cache) {
      if (!wanted.includes(record.lot) && (distance(record.lot) > 1000 || cache.size >= CACHE_LIMIT)) {
        group.remove(record.mesh); record.mesh.geometry.dispose(); cache.delete(key);
      }
    }
    queue = wanted.filter((lot) => !cache.has(lot.key)); rebuild();
    if (!worker && queue.length) worker = setTimeout(work, 0);
  }
  function parkingCollidersAt(x, z, radius) {
    return colliders.filter((c) => c.maxX >= x - radius && c.minX <= x + radius && c.maxZ >= z - radius && c.minZ <= z + radius);
  }
  services.parkingCollidersAt = parkingCollidersAt;
  update(SPAWN);
  return { group, update };
}
