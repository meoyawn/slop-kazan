import * as THREE from 'three/webgpu';
import { polygonContains } from './footprints.js';

/** All generic passages share mapped corridor alignment; facade families supply only their trim and ornament level. */
export function createKazanPassageFrames({ box, plainMaterial }, passages) {
  const cells = new Map(), cellSize = 128;
  for (const p of passages) for (let i = 2; i < p.pts.length; i += 2) {
    const dx = p.pts[i] - p.pts[i - 2], dz = p.pts[i + 1] - p.pts[i - 1], length = Math.hypot(dx, dz);
    if (length < 0.1) continue;
    const ux = dx / length, uz = dz / length;
    const segment = { p, ax: p.pts[i - 2] - (i === 2 ? ux * 3 : 0), az: p.pts[i - 1] - (i === 2 ? uz * 3 : 0),
      cx: p.pts[i] + (i === p.pts.length - 2 ? ux * 3 : 0), cz: p.pts[i + 1] + (i === p.pts.length - 2 ? uz * 3 : 0), ux, uz };
    const pad = p.width / 2 + 1;
    for (let x = Math.floor((Math.min(segment.ax, segment.cx) - pad) / cellSize); x <= Math.floor((Math.max(segment.ax, segment.cx) + pad) / cellSize); x++) {
      for (let z = Math.floor((Math.min(segment.az, segment.cz) - pad) / cellSize); z <= Math.floor((Math.max(segment.az, segment.cz) + pad) / cellSize); z++) {
        const key = `${x},${z}`; if (!cells.has(key)) cells.set(key, []); cells.get(key).push(segment);
      }
    }
  }
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), tangent = new THREE.Vector3(), vertical = new THREE.Vector3(), normal = new THREE.Vector3();

  function build(group, b, base) {
    if (!b.openingVolumes) return 0;
    const candidates = new Set(), xs = b.ring.filter((_, i) => i % 2 === 0), zs = b.ring.filter((_, i) => i % 2 === 1);
    for (let x = Math.floor(Math.min(...xs) / cellSize); x <= Math.floor(Math.max(...xs) / cellSize); x++) {
      for (let z = Math.floor(Math.min(...zs) / cellSize); z <= Math.floor(Math.max(...zs) / cellSize); z++) for (const s of cells.get(`${x},${z}`) || []) candidates.add(s);
    }
    const ornate = b.facadeFamily === 'stalinka-neoclassical', frameWidth = ornate ? 0.38 : 0.22;
    const trim = plainMaterial(b.appearance?.trimColour || 0xd8d4c6), seen = new Set();
    let count = 0;
    for (const ring of [b.ring, ...b.holes]) for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const ax = ring[j], az = ring[j + 1], dx = ring[i] - ax, dz = ring[i + 1] - az, length = Math.hypot(dx, dz);
      if (length < 1) continue;
      const ux = dx / length, uz = dz / length;
      for (const s of candidates) {
        const vx = s.cx - s.ax, vz = s.cz - s.az, determinant = dx * vz - dz * vx;
        if (Math.abs(determinant) < 0.001) continue;
        const tx = s.ax - ax, tz = s.az - az, t = (tx * vz - tz * vx) / determinant, v = (tx * dz - tz * dx) / determinant;
        if (t <= 0 || t >= 1 || v < 0 || v > 1) continue;
        const crossing = Math.abs(ux * s.uz - uz * s.ux); if (crossing < 0.35) continue;
        const half = s.p.width / crossing / 2, u = length * t;
        const height = Math.min(s.p.height, b.h - 0.25), spring = Math.min(s.p.spring, b.h - 0.5);
        if (spring <= (b.minHeight || 0) || height <= spring) continue;
        const thickness = Math.min(frameWidth, (b.h - height) / 1.8);
        if (u - half < thickness * 2 || u + half > length - thickness * 2) continue;
        const x = ax + dx * t, z = az + dz * t, key = `${s.p.road}/${x.toFixed(2)}/${z.toFixed(2)}`;
        if (seen.has(key)) continue; seen.add(key);
        let nx = -uz, nz = ux;
        if (polygonContains(b.ring, x + nx * 0.05, z + nz * 0.05) && !b.holes.some((hole) => polygonContains(hole, x + nx * 0.05, z + nz * 0.05))) { nx = -nx; nz = -nz; }
        const depth = ornate ? 0.32 : 0.22, projection = depth / 2 + 0.025, yaw = -Math.atan2(uz, ux), bottom = Math.max(0, b.minHeight || 0);
        const radius = half + thickness;
        for (const sign of [-1, 1]) box(group, x + ux * sign * radius + nx * projection, base + (bottom + spring) / 2,
          z + uz * sign * radius + nz * projection, thickness, spring - bottom, depth, trim, yaw);
        normal.set(nx, 0, nz);
        for (let step = 0; step < 12; step++) {
          const a = step / 12 * Math.PI, c = (step + 1) / 12 * Math.PI;
          const au = -Math.cos(a) * radius, cu = -Math.cos(c) * radius;
          const ay = spring + Math.sin(a) * (height - spring + thickness), cy = spring + Math.sin(c) * (height - spring + thickness);
          const span = Math.hypot(cu - au, cy - ay);
          tangent.set(ux * (cu - au) / span, (cy - ay) / span, uz * (cu - au) / span);
          vertical.crossVectors(normal, tangent); matrix.makeBasis(tangent, vertical, normal); rotation.setFromRotationMatrix(matrix);
          box(group, x + ux * (au + cu) / 2 + nx * projection, base + (ay + cy) / 2, z + uz * (au + cu) / 2 + nz * projection,
            span + 0.015, thickness, depth, trim, 0, rotation);
        }
        if (ornate) box(group, x + nx * (projection + 0.025), base + height + thickness * 0.9, z + nz * (projection + 0.025),
          thickness * 1.6, thickness * 1.2, depth + 0.05, trim, yaw);
        count++;
      }
    }
    return count;
  }
  return { build };
}
