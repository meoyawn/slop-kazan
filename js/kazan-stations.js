import * as THREE from 'three/webgpu';
import { toPoints, pointInPoly } from './kazan-config.js';
import { createObservedFacadeMaterial } from './kazan-facades.js';

/** Station facades share mapped envelopes and repeated masonry/glazing components. Decorative sizes remain photographic estimates. */
export function createKazanStationModels(draw) {
  const { plainMaterial, box, solid, shapeOf, splitExtrusion, emit, pitchedRoof, label } = draw;
  const white = plainMaterial(0xe1e0d5), pale = plainMaterial(0xcdd1cd), red = plainMaterial(0xa32931);
  const glass = plainMaterial(0x315767, 0.35), gold = plainMaterial(0xb7985b, 0.5), dark = plainMaterial(0x4f3931);
  const roof = plainMaterial(0xa1aaa8, 0.4), plinth = plainMaterial(0x747e7a);

  function faces(b) {
    const poly = toPoints(b.ring), result = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], c = poly[(i + 1) % poly.length], length = Math.hypot(c.x - a.x, c.z - a.z);
      if (length < 0.5) continue;
      const ux = (c.x - a.x) / length, uz = (c.z - a.z) / length, x = (a.x + c.x) / 2, z = (a.z + c.z) / 2;
      let nx = -uz, nz = ux;
      if (pointInPoly(poly, x + nx * 0.15, z + nz * 0.15)) { nx = -nx; nz = -nz; }
      result.push({ x, z, ux, uz, nx, nz, length, yaw: -Math.atan2(uz, ux), labelYaw: Math.atan2(nx, nz) });
    }
    return result;
  }
  function panel(group, f, u, y, width, height, depth, projection, material) {
    box(group, f.x + f.ux * u + f.nx * projection, y, f.z + f.uz * u + f.nz * projection, width, height, depth, material, f.yaw);
  }
  function envelope(group, b, base, height, material) {
    const geometry = new THREE.ExtrudeGeometry(shapeOf(b.ring, b.holes), { depth: height, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2).translate(0, base, 0);
    splitExtrusion(group, geometry, roof, material, base);
  }
  function frame(b, boundaries) {
    const long = boundaries.toSorted((a, c) => c.length - a.length)[0], poly = toPoints(b.ring);
    let nx = long.nx, nz = long.nz;
    const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length, cz = poly.reduce((s, p) => s + p.z, 0) / poly.length;
    if ((b.frontTowards[0] - cx) * nx + (b.frontTowards[1] - cz) * nz < 0) { nx = -nx; nz = -nz; }
    const ux = nz, uz = -nx, us = poly.map((p) => p.x * ux + p.z * uz), vs = poly.map((p) => p.x * nx + p.z * nz);
    const u = (Math.min(...us) + Math.max(...us)) / 2, v = Math.max(...vs);
    return { x: ux * u + nx * v, z: uz * u + nz * v, ux, uz, nx, nz,
      length: Math.max(...us) - Math.min(...us), depth: Math.max(...vs) - Math.min(...vs), yaw: -Math.atan2(uz, ux), labelYaw: Math.atan2(nx, nz) };
  }
  function arch(group, f, u, bottom, width, height, material, projection) {
    const shape = new THREE.Shape(), radius = width / 2;
    shape.moveTo(-radius, 0); shape.lineTo(radius, 0); shape.lineTo(radius, height - radius);
    shape.absarc(0, height - radius, radius, 0, Math.PI, false); shape.lineTo(-radius, 0);
    const g = new THREE.ShapeGeometry(shape).toNonIndexed();
    g.rotateY(f.labelYaw).translate(f.x + f.ux * u + f.nx * projection, bottom, f.z + f.uz * u + f.nz * projection);
    emit(group, g, material);
  }
  function clock(group, f, u, y, radius, projection) {
    const x = f.x + f.ux * u + f.nx * projection, z = f.z + f.uz * u + f.nz * projection;
    const disk = new THREE.CircleGeometry(radius, 32).toNonIndexed(); disk.rotateY(f.labelYaw).translate(x, y, z); emit(group, disk, pale);
    for (let i = 0; i < 12; i++) panel(group, f, u + Math.sin(i * Math.PI / 6) * radius * 0.78,
      y + Math.cos(i * Math.PI / 6) * radius * 0.78, 0.09, 0.13, 0.06, projection + 0.03, dark);
    panel(group, f, u, y + radius * 0.25, 0.08, radius * 0.5, 0.07, projection + 0.04, dark);
    panel(group, f, u + radius * 0.18, y, radius * 0.36, 0.08, 0.07, projection + 0.04, dark);
  }
  function historic(group, b, base) {
    const boundaries = faces(b), front = frame(b, boundaries), height = 10.5;
    const appearance = { ...b.appearance, windowRatioX: 0.0001, windowRatioY: 0.0001 };
    const brick = createObservedFacadeMaterial(appearance);
    envelope(group, b, base, height, brick);
    pitchedRoof(group, { ...b, h: height + 3.2 }, base, 3.2, roof);
    for (const f of boundaries) {
      panel(group, f, 0, base + 0.3, f.length, 0.6, 0.25, 0.08, plinth);
      for (const y of [5.6, 10.4, 10.75]) panel(group, f, 0, base + y, f.length + 0.12, 0.16, 0.32, 0.13, y > 10 ? white : dark);
      const count = Math.max(1, Math.round(f.length / 4.3));
      for (let i = 0; i < count; i++) {
        const u = (i + 0.5) * f.length / count - f.length / 2;
        if (f.length < 2) continue;
        for (const [bottom, w, h] of [[1.2, 1.9, 3.5], [6.7, 1.45, 2.3]]) {
          arch(group, f, u, base + bottom - 0.13, w + 0.4, h + 0.3, dark, 0.09);
          arch(group, f, u, base + bottom, w, h, glass, 0.13);
          panel(group, f, u, base + bottom + (h - w / 2) / 2, 0.065, h - w / 2, 0.08, 0.17, gold);
          panel(group, f, u, base + bottom + h - w / 2, w, 0.07, 0.08, 0.17, gold);
          panel(group, f, u, base + bottom - 0.1, w + 0.32, 0.18, 0.38, 0.16, brick);
        }
        panel(group, f, u, base + 10.1, 0.35, 0.5, 0.2, 0.25, white);
      }
    }
    for (const [w, bottom, h] of [[35, 10.8, 1.2], [25, 12, 1.5], [17, 13.5, 1.7], [11.5, 15.2, 3.2]]) {
      panel(group, front, 0, base + bottom + h / 2, w, h, 4.8, -2.1, brick);
      panel(group, front, 0, base + bottom + h, w + 0.35, 0.22, 5.2, -2.1, roof);
      for (let u = -w / 2 + 0.8; u < w / 2; u += 1.1) panel(group, front, u, base + bottom + h - 0.45, 0.22, 0.4, 0.22, 0.44, white);
    }
    for (const u of [-3.4, -1.7, 0, 1.7, 3.4]) arch(group, front, u, base + 15.5, 0.8, 1.75, dark, 0.43);
    clock(group, front, 0, base + 14.4, 0.82, 0.46);
    panel(group, front, 0, base + 6.5, 17, 0.45, 4.6, 1.4, roof);
    for (const u of [-3.3, 3.3]) {
      arch(group, front, u, base + 0.6, 3, 5.4, dark, 3.72);
      arch(group, front, u, base + 0.85, 2.6, 4.9, glass, 3.76);
      panel(group, front, u, base + 2.7, 0.09, 3.7, 0.1, 3.82, gold);
    }
    for (const u of [-8, 0, 8]) panel(group, front, u, base + 3.2, 0.5, 6.1, 0.6, 3.9, white);
    const cx = front.x - front.nx * 2.1, cz = front.z - front.nz * 2.1;
    solid(group, new THREE.SphereGeometry(1, 16, 10), roof, cx, base + 18.8, cz, [4, 1.2, 2.6]);
    solid(group, new THREE.ConeGeometry(0.55, 5.5, 10), roof, cx, base + 22.4, cz);
    for (const side of [-1, 1]) label(group, side < 0 ? 'ВОКЗАЛ' : 'STATION',
      front.x + front.ux * side * 24 + front.nx * 0.5, base + 12.2,
      front.z + front.uz * side * 24 + front.nz * 0.5, 17, 2.1, front.labelYaw, '#ad2c36');
  }
  function modern(group, b, base) {
    const boundaries = faces(b), front = frame(b, boundaries), h = b.h;
    envelope(group, b, base, h, white);
    for (const f of boundaries) {
      if (f.length < 2) continue;
      const count = Math.max(1, Math.round(f.length / 2.8)), bay = f.length / count;
      panel(group, f, 0, base + 2.7, f.length - 0.2, 4.9, 0.12, 0.08, glass);
      panel(group, f, 0, base + 5.8, f.length + 0.2, 0.6, 0.6, 0.2, red);
      panel(group, f, 0, base + 0.3, f.length, 0.6, 0.3, 0.2, plinth);
      for (let i = 0; i <= count; i++) {
        const u = -f.length / 2 + i * bay;
        panel(group, f, u, base + 2.9, 0.12, 5.3, 0.3, 0.2, pale);
        panel(group, f, u, base + (h + 6.2) / 2, 0.035, h - 6.2, 0.1, 0.1, pale);
      }
      for (const y of [2, 3.9, 5]) panel(group, f, 0, base + y, f.length, 0.07, 0.16, 0.17, pale);
    }
    panel(group, front, 0, base + h + 0.6, 9, 1.2, 6, -2.6, white);
    panel(group, front, 0, base + 5.9, 22, 0.75, 5, 1.6, red);
    for (const [u, text, width] of [[-front.length * 0.3, 'TERMINAL', 24], [front.length * 0.32, 'КАЗАНЬ-2', 22]]) {
      label(group, text, front.x + front.ux * u + front.nx * 0.4, base + h + 1.5,
        front.z + front.uz * u + front.nz * 0.4, width, 2.2, front.labelYaw, '#a32331');
    }
  }
  function administration(group, b, base) {
    const boundaries = faces(b), front = frame(b, boundaries), brick = plainMaterial(0x9e594e);
    envelope(group, b, base, 10.8, white);
    for (const f of boundaries) {
      panel(group, f, 0, base + 2, f.length, 3.8, 0.2, 0.08, brick);
      panel(group, f, 0, base + 7.4, f.length - 2.6, 5.4, 0.2, 0.08, brick);
      for (let u = -f.length / 2 + 2.1; u < f.length / 2 - 1; u += 2.4) {
        arch(group, f, u, base + 4.6, 1.25, 5.1, white, 0.22);
        arch(group, f, u, base + 4.8, 0.8, 4.55, glass, 0.25);
        panel(group, f, u, base + 6.6, 0.07, 3.6, 0.1, 0.3, pale);
      }
      panel(group, f, 0, base + 4.2, f.length, 0.55, 0.3, 0.16, white);
    }
    const u = front.length * 0.32;
    panel(group, front, u, base + 14, 5.3, 9, 5.3, -2.2, white);
    panel(group, front, u, base + 15, 4.4, 4.8, 0.12, 0.5, brick);
    clock(group, front, u, base + 15.7, 1.25, 0.6);
    solid(group, new THREE.ConeGeometry(3.8, 7, 4), plainMaterial(0x467872), front.x + front.ux * u - front.nx * 2.2,
      base + 22, front.z + front.uz * u - front.nz * 2.2);
  }
  function emitBuilding(group, b, base) {
    if (b.model === 'station-historic') historic(group, b, base);
    else if (b.model === 'station-modern') modern(group, b, base);
    else if (b.model === 'station-administration') administration(group, b, base);
    else return false;
    return true;
  }
  return { emitBuilding };
}
