import * as THREE from 'three/webgpu';
import { polygonContains } from './footprints.js';

/** Photographed rooftop pavilions share one parameterised silhouette and the existing spatial palette. */
export function createClassicalCrowns({ box, solid, plainMaterial }) {
  function layout(b) {
    const c = b.stalinkaCrown;
    if (!c || !polygonContains(b.ring, c.x, c.z) || b.holes.some((r) => polygonContains(r, c.x, c.z))) return null;
    return c;
  }
  function ring(c, width, depth) {
    const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([u, v]) =>
      [c.x + u * width / 2 * cs + v * depth / 2 * sn, c.z - u * width / 2 * sn + v * depth / 2 * cs]);
  }
  function shapes(b) {
    const c = layout(b); if (!c) return [];
    const bottom = c.baseHeight, upper = bottom + c.belvedereHeight + 0.6;
    const sections = [[c.width + 1.1, c.depth + 1.1, bottom, upper],
      [c.lanternRadius * 2.6, c.lanternRadius * 2.6, upper, upper + c.lanternHeight + (c.spireHeight ? 0.4 : 1.1)]];
    if (c.spireHeight) sections.push([0.65, 0.65, upper + c.lanternHeight + 0.4, upper + c.lanternHeight + 0.4 + c.spireHeight]);
    return sections.map(([w, d, minHeight, h]) => ({ ...b, ring: ring(c, w, d), holes: [], minHeight, h,
      colour: b.appearance.trimColour, roofColour: b.appearance.trimColour, appearance: { windows: false } }));
  }
  function decorate(group, b, base) {
    const c = layout(b); if (!c) return;
    const trim = plainMaterial(b.appearance.trimColour), wall = plainMaterial(b.appearance.wallColour);
    const dark = plainMaterial('#394f4c'), metal = plainMaterial('#786e50', 0.35), bottom = base + c.baseHeight;
    const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
    function block(u, v, y, w, h, d, material = trim) {
      box(group, c.x + u * cs + v * sn, y, c.z - u * sn + v * cs, w, h, d, material, c.yaw);
    }
    const support = Math.max(0, c.baseHeight - (b.h - b.roofHeight));
    if (support) block(0, 0, bottom - support / 2, c.width, support, c.depth, wall);
    block(0, 0, bottom + 0.2, c.width + 0.8, 0.4, c.depth + 0.8);
    if (c.belvedereHeight > 1.5) {
      const h = c.belvedereHeight;
      for (const [u, v] of [[-1,-1],[-1,1],[1,-1],[1,1],[0,-1],[0,1],[-1,0],[1,0]]) {
        block(u * (c.width - 0.8) / 2, v * (c.depth - 0.8) / 2, bottom + 0.4 + h / 2, 0.65, h, 0.65);
      }
      block(0, 0, bottom + h + 0.6, c.width + 1.1, 0.4, c.depth + 1.1);
    } else {
      const rim = 0.25;
      for (const v of [-1, 1]) block(0, v * c.depth / 2, bottom + 0.85, c.width, rim, rim, dark);
      for (const u of [-1, 1]) block(u * c.width / 2, 0, bottom + 0.85, rim, rim, c.depth, dark);
      for (const [u, v] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
        block(u * c.width / 2, v * c.depth / 2, bottom + 0.9, 0.6, 1.4, 0.6);
      }
    }
    const y = bottom + c.belvedereHeight + 0.6, r = c.lanternRadius, height = c.lanternHeight;
    if (!c.openLantern) solid(group, new THREE.CylinderGeometry(r * 1.05, r * 1.05, height, 8), wall, c.x, y + height / 2, c.z);
    for (let i = 0; i < 8; i++) {
      const angle = (i + 0.5) * Math.PI / 4, nx = Math.sin(angle), nz = Math.cos(angle), radius = r * 0.99;
      if (!c.openLantern) box(group, c.x + nx * radius, y + height * 0.51, c.z + nz * radius, r * 0.48, height * 0.67, 0.08, dark, angle);
      solid(group, new THREE.CylinderGeometry(c.openLantern ? r * 0.12 : 0.1, c.openLantern ? r * 0.15 : 0.13, height, 6), trim,
        c.x + Math.sin(i * Math.PI / 4) * r * 1.08, y + height / 2, c.z + Math.cos(i * Math.PI / 4) * r * 1.08);
      if (c.openLantern) {
        const opening = r * 2.16 * Math.sin(Math.PI / 8), radius = r * 1.08 * Math.cos(Math.PI / 8);
        const arch = new THREE.TorusGeometry(opening / 2, 0.14, 4, 8, Math.PI); arch.rotateY(angle);
        solid(group, arch, trim, c.x + nx * radius, y + height - opening / 2 - 0.15, c.z + nz * radius);
      }
    }
    for (const top of [y + 0.08, y + height]) solid(group, new THREE.CylinderGeometry(r * 1.25, r * 1.25, 0.25, 8), trim, c.x, top, c.z);
    if (c.spireHeight) {
      solid(group, new THREE.ConeGeometry(r * 0.7, c.spireHeight, 8), metal, c.x, y + height + c.spireHeight / 2 + 0.15, c.z);
    } else {
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2;
        solid(group, new THREE.ConeGeometry(0.16, 0.9, 5), trim, c.x + Math.sin(angle) * r, y + height + 0.65, c.z + Math.cos(angle) * r);
      }
    }
  }
  return { decorate, shapes };
}
