import * as THREE from 'three/webgpu';
import { toPoints, pointInPoly, terrainHeight, groundSurfaceHeight } from './kazan-config.js';
import { createObservedFacadeMaterial } from './kazan-facades.js';

/** The KAZ office retains its mapped wings and courtyards; facade and roof dimensions are photo estimates. */
export function createKazanFactoryAdmin(draw) {
  const { plainMaterial, box, emit, flush, shapeOf, splitExtrusion, pitchedRoof, label } = draw;
  const white = plainMaterial(0xe1e1d9), trim = plainMaterial(0xf0eee4), gray = plainMaterial(0x949a98);
  const roof = plainMaterial(0x8d999c, 0.35), glass = plainMaterial(0x4a6268, 0.2), dark = plainMaterial(0x3c4e54);
  const steel = plainMaterial(0x6e7876, 0.4), gold = plainMaterial(0xa89155, 0.3);

  function faces(b, ring = b.ring, inner = false) {
    const p = toPoints(ring), result = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], c = p[(i + 1) % p.length], length = Math.hypot(c.x - a.x, c.z - a.z);
      if (length < 0.5) continue;
      const ux = (c.x - a.x) / length, uz = (c.z - a.z) / length, x = (a.x + c.x) / 2, z = (a.z + c.z) / 2;
      let nx = -uz, nz = ux;
      if (pointInPoly(p, x + nx * 0.2, z + nz * 0.2) !== inner) { nx = -nx; nz = -nz; }
      result.push({ x, z, ux, uz, nx, nz, length, yaw: -Math.atan2(uz, ux), labelYaw: Math.atan2(nx, nz) });
    }
    return result;
  }

  function panel(group, f, u, y, w, h, d, projection, material) {
    box(group, f.x + f.ux * u + f.nx * projection, y, f.z + f.uz * u + f.nz * projection, w, h, d, material, f.yaw);
  }

  function window(group, f, u, y, w = 1.75, h = 1.9) {
    panel(group, f, u, y, w, h, 0.08, 0.08, glass);
    for (const side of [-1, 1]) panel(group, f, u + side * w / 2, y, 0.09, h + 0.1, 0.12, 0.14, trim);
    for (const v of [-h / 2, h / 2]) panel(group, f, u, y + v, w + 0.15, 0.08, 0.16, 0.14, trim);
    panel(group, f, u + w * 0.08, y, 0.065, h, 0.12, 0.15, trim);
    panel(group, f, u, y + h * 0.2, w, 0.06, 0.12, 0.15, trim);
  }

  function portal(group, f, base) {
    panel(group, f, 0, base + 7.6, 15.2, 15.2, 2, 0.9, white);
    panel(group, f, 0, base + 7.5, 11.6, 13.8, 0.16, 1.99, gray);
    panel(group, f, 0, base + 7.7, 8.25, 12.45, 0.12, 2.1, glass);
    for (const u of [-4.1, -2.05, 0, 2.05, 4.1]) panel(group, f, u, base + 7.7, 0.12, 12.5, 0.16, 2.19, trim);
    for (const y of [1.55, 3.55, 6.1, 8.65, 11.2, 13.9]) panel(group, f, 0, base + y, 8.3, 0.1, 0.16, 2.19, trim);
    for (const u of [-6.6, 6.6]) {
      panel(group, f, u, base + 7.4, 1.25, 14.8, 0.5, 2, trim);
      panel(group, f, u, base + 14.3, 1.65, 0.55, 0.9, 2.15, trim);
    }
    for (const [y, w, h, d] of [[15.05, 16.2, 0.35, 1.2], [15.55, 16.7, 0.3, 1.5], [16, 15.6, 0.45, 0.5]]) panel(group, f, 0, base + y, w, h, d, 1.75, trim);
    panel(group, f, 0, base + 2.7, 9, 0.18, 1.7, 2.6, steel);
    const ground = groundSurfaceHeight(f.x + f.nx * 3, f.z + f.nz * 3);
    panel(group, f, 0, ground - 0.04, 8.8, 0.08, 1.9, 2.55, gray);
    const name = new THREE.Vector3(f.x + f.nx * 2.2, base + 14.42, f.z + f.nz * 2.2);
    label(group, 'им. С.П. Горбунова', name.x, name.y, name.z, 9.2, 0.55, f.labelYaw, '#e7e7dc');
    label(group, 'КАЗ', f.x + f.nx * 1.65, base + 17.2, f.z + f.nz * 1.65, 18, 1.6, f.labelYaw, '#d8dfd7');
    for (const u of [-6.2, -4.2, 4.2, 6.2]) {
      const geometry = new THREE.CylinderGeometry(0.58, 0.58, 0.1, 16).rotateX(Math.PI / 2).rotateY(f.labelYaw);
      geometry.translate(f.x + f.ux * u + f.nx * 1.65, base + 17.15, f.z + f.uz * u + f.nz * 1.65);
      emit(group, geometry.toNonIndexed(), gold);
    }
  }

  function staircaseTower(group, f, u, base) {
    panel(group, f, u, base + 7.15, 7.8, 14.3, 0.85, 0.35, white);
    panel(group, f, u, base + 7.2, 6.2, 12.5, 0.12, 0.83, glass);
    for (const offset of [-3.05, -1.52, 0, 1.52, 3.05]) panel(group, f, u + offset, base + 7.2, 0.1, 12.5, 0.14, 0.94, trim);
    for (const y of [1, 4.1, 7.2, 10.3, 13.4]) panel(group, f, u, base + y, 6.2, 0.14, 0.14, 0.94, trim);
    panel(group, f, u, base + 14.45, 8.5, 0.5, 1.3, 0.35, trim);
  }

  function emitBuilding(parent, b, base) {
    if (b.model !== 'kaz-factory-admin') return false;
    const group = new THREE.Group(); group.name = `KazanFactoryAdministration/${b.id}`;
    const geometry = new THREE.ExtrudeGeometry(shapeOf(b.ring, b.holes), { depth: 11.65, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2).translate(0, base, 0);
    splitExtrusion(group, geometry, roof, createObservedFacadeMaterial(b.appearance), base);
    const outer = faces(b), boundaries = outer.concat(...b.holes.map((r) => faces(b, r, true)));
    const front = outer.filter((f) => f.length > 100).sort((a, c) => (c.nx * -0.9 + c.nz * 0.2) - (a.nx * -0.9 + a.nz * 0.2))[0];
    for (const f of boundaries) {
      panel(group, f, 0, base + 0.24, f.length, 0.48, 0.18, 0.05, dark);
      panel(group, f, 0, base + 3.62, f.length, 0.16, 0.18, 0.08, trim);
      panel(group, f, 0, base + 11.52, f.length + 0.15, 0.32, 0.6, 0.15, trim);
      const n = Math.max(1, Math.round(f.length / 2.9)), bay = f.length / n;
      for (let i = 0; i < n; i++) {
        const u = -f.length / 2 + (i + 0.5) * bay;
        if (f === front && (Math.abs(u) < 8 || Math.abs(u) > f.length / 2 - 8)) continue;
        for (const y of [1.85, 5.15, 8.45]) window(group, f, u, base + y, Math.min(1.9, bay * 0.68));
      }
      const low = terrainHeight(f.x, f.z);
      if (low < base - 0.2) panel(group, f, 0, (low + base) / 2, f.length, base - low, 0.12, 0.03, gray);
    }
    pitchedRoof(group, { ...b, h: 14.25, roofShape: 'hipped' }, base, 2.6, roof);
    portal(group, front, base);
    for (const u of [-front.length / 2 + 5.4, front.length / 2 - 5.4]) staircaseTower(group, front, u, base);
    for (const u of [-55, -28, 28, 55]) {
      const x = front.x + front.ux * u - front.nx * 4, z = front.z + front.uz * u - front.nz * 4;
      const p = [[-1.1, 12.55], [1.1, 12.55], [0, 13.85]], vertices = [];
      for (const [v, y] of p) vertices.push(x + front.ux * v, base + y, z + front.uz * v);
      const face = new THREE.BufferGeometry();
      face.setAttribute('position', new THREE.Float32BufferAttribute(vertices.concat(vertices.slice(6, 9), vertices.slice(3, 6), vertices.slice(0, 3)), 3));
      face.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(12), 2));
      face.computeVertexNormals(); emit(group, face, dark);
      const ring = [x - front.ux * 1.2 - front.nx * 3, z - front.uz * 1.2 - front.nz * 3,
        x + front.ux * 1.2 - front.nx * 3, z + front.uz * 1.2 - front.nz * 3,
        x + front.ux * 1.2 + front.nx * 0.1, z + front.uz * 1.2 + front.nz * 0.1,
        x - front.ux * 1.2 + front.nx * 0.1, z - front.uz * 1.2 + front.nz * 0.1];
      pitchedRoof(group, { ring, holes: [], h: 14, roofShape: 'gabled' }, base, 1.3, roof);
    }
    for (const u of [-34, -31, -28]) {
      const x = front.x + front.ux * u + front.nx * 7, z = front.z + front.uz * u + front.nz * 7, ground = groundSurfaceHeight(x, z);
      box(group, x, ground + 4.6, z, 0.1, 9.2, 0.1, steel);
    }
    flush(group); parent.add(group);
    return true;
  }

  function collisionShapes(b) {
    if (b.model !== 'kaz-factory-admin') return null;
    const f = faces(b).filter((f) => f.length > 100).sort((a, c) => (c.nx * -0.9 + c.nz * 0.2) - (a.nx * -0.9 + a.nz * 0.2))[0];
    const ring = [-7.6, 7.6].flatMap((u) => [0, 2.05].map((d) => [f.x + f.ux * u + f.nx * d, f.z + f.uz * u + f.nz * d]));
    return [{ ...b, h: 14.25 }, { ...b, ring: [...ring[0], ...ring[2], ...ring[3], ...ring[1]], holes: [], h: 16.25 }];
  }
  return { emitBuilding, collisionShapes };
}
