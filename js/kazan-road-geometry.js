import * as THREE from 'three/webgpu';
import { roadHeight, projectGroundPolygon } from './kazan-config.js';
import { services } from './kazan-runtime.js';

/** Compile terrain-conforming road facets without repeating geographic projection in the browser. */
export function createRoadGeometry(road, width, offset, innerWidth = 0) {
  const position = [], uv = [], indices = [];
  function appendTriangle(a, b, c, depth = 0) {
    if (!road.gradeSamples && depth < 7) {
      const points = [a, b, c], midpoints = [], errors = [], lengths = [];
      for (let i = 0; i < 3; i++) {
        const p = points[i], q = points[(i + 1) % 3], m = p.map((value, j) => (value + q[j]) / 2);
        m[4] = roadHeight(road, m[0], m[1]);
        midpoints.push(m); errors.push(Math.abs(m[4] - (p[4] + q[4]) / 2));
        lengths.push(Math.hypot(p[0] - q[0], p[1] - q[1]));
      }
      const centreError = Math.abs(roadHeight(road, (a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3) - (a[4] + b[4] + c[4]) / 3);
      if (Math.max(...errors, centreError) > 0.025 && Math.max(...lengths) > 0.5) {
        let edge = lengths.indexOf(Math.max(...lengths));
        if (Math.max(...errors) > 0.025) edge = errors.indexOf(Math.max(...errors));
        appendTriangle(points[edge], midpoints[edge], points[(edge + 2) % 3], depth + 1);
        appendTriangle(midpoints[edge], points[(edge + 1) % 3], points[(edge + 2) % 3], depth + 1);
        return;
      }
    }
    const first = position.length / 3;
    for (const p of [a, b, c]) {
      position.push(p[0], p[4] + offset, p[1]); uv.push(p[2], p[3]);
    }
    indices.push(first, first + 1, first + 2);
  }
  let travelled = 0;
  for (let i = 0; i + 1 < road.pts.length; i++) {
    const a = road.pts[i], b = road.pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 0.01) continue;
    const nx = (a.z - b.z) / len, nz = (b.x - a.x) / len;
    const bands = innerWidth > 0 ? [[-width / 2, -innerWidth / 2], [innerWidth / 2, width / 2]] : [[-width / 2, width / 2]];
    const steps = Math.max(1, Math.ceil(len / (road.gradeSamples || road.stepSegments ? 6 : 90)));
    for (let k = 0; k < steps; k++) {
      const x0 = a.x + (b.x - a.x) * k / steps, z0 = a.z + (b.z - a.z) * k / steps;
      const x1 = a.x + (b.x - a.x) * (k + 1) / steps, z1 = a.z + (b.z - a.z) * (k + 1) / steps;
      for (const [left, right] of bands) {
        const corners = [[x0 + nx * left, z0 + nz * left, left + width / 2, travelled + len * k / steps],
          [x0 + nx * right, z0 + nz * right, right + width / 2, travelled + len * k / steps],
          [x1 + nx * right, z1 + nz * right, right + width / 2, travelled + len * (k + 1) / steps],
          [x1 + nx * left, z1 + nz * left, left + width / 2, travelled + len * (k + 1) / steps]];
        if (!road.gradeSamples && !road.stepSegments) projectGroundPolygon(corners, appendProjectedPolygon);
        else {
          for (const p of corners) p.push(roadHeight(road, p[0], p[1]));
          appendTriangle(corners[0], corners[1], corners[2]);
          appendTriangle(corners[0], corners[2], corners[3]);
        }
      }
    }
    travelled += len;
  }
  if (!position.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  if (!road.bridge && (road.walk || innerWidth > 0)) services.groundOpenings?.cutGeometry(geometry);
  geometry.computeVertexNormals();
  return geometry;

  function appendProjectedPolygon(face) {
    const first = position.length / 3;
    for (const p of face) {
      position.push(p[0], p[4] + offset, p[1]); uv.push(p[2], p[3]);
    }
    for (let i = 1; i + 1 < face.length; i++) indices.push(first, first + i, first + i + 1);
  }
}

