import * as THREE from 'three/webgpu';

function split(face, a, b, sign) {
  const inside = [], outside = [], dx = b[0] - a[0], dz = b[1] - a[1];
  for (let i = 0, j = face.length - 1; i < face.length; j = i++) {
    const p = face[j], q = face[i], before = sign * (dx * (p[1] - a[1]) - dz * (p[0] - a[0])), after = sign * (dx * (q[1] - a[1]) - dz * (q[0] - a[0]));
    if ((before >= 0) !== (after >= 0)) {
      const t = before / (before - after), point = p.map((v, k) => v + (q[k] - v) * t);
      inside.push(point); outside.push(point);
    }
    if (after >= 0) inside.push(q); else outside.push(q);
  }
  return { inside, outside };
}

function boundsOf(face) {
  const xs = face.map((p) => p[0]), zs = face.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

/** Convex stairwell voids cut existing terrain facets without lowering streets above the passage. */
export function createGroundOpenings(rings) {
  const cells = new Map(), openings = rings.map((ring) => {
    const points = Array.from({ length: ring.length / 2 }, (_, i) => ring.slice(i * 2, i * 2 + 2));
    let area = 0;
    for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; area += a[0] * b[1] - b[0] * a[1]; }
    return { points, sign: area >= 0 ? 1 : -1, ...boundsOf(points) };
  });
  for (const opening of openings) for (let x = Math.floor(opening.minX / 128); x <= Math.floor(opening.maxX / 128); x++) {
    for (let z = Math.floor(opening.minZ / 128); z <= Math.floor(opening.maxZ / 128); z++) {
      const key = `${x},${z}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(opening);
    }
  }
  function candidates(minX, minZ, maxX, maxZ) {
    const result = new Set();
    for (let x = Math.floor(minX / 128); x <= Math.floor(maxX / 128); x++) for (let z = Math.floor(minZ / 128); z <= Math.floor(maxZ / 128); z++) {
      for (const opening of cells.get(`${x},${z}`) || []) {
        if (opening.maxX >= minX && opening.minX <= maxX && opening.maxZ >= minZ && opening.minZ <= maxZ) result.add(opening);
      }
    }
    return result;
  }
  function intersects(minX, minZ, maxX, maxZ) {
    for (let x = Math.floor(minX / 128); x <= Math.floor(maxX / 128); x++) for (let z = Math.floor(minZ / 128); z <= Math.floor(maxZ / 128); z++) {
      for (const o of cells.get(`${x},${z}`) || []) if (o.maxX >= minX && o.minX <= maxX && o.maxZ >= minZ && o.minZ <= maxZ) return true;
    }
    return false;
  }
  function contains(x, z) {
    for (const o of cells.get(`${Math.floor(x / 128)},${Math.floor(z / 128)}`) || []) {
      if (x < o.minX || x > o.maxX || z < o.minZ || z > o.maxZ) continue;
      let inside = true;
      for (let i = 0; i < o.points.length; i++) {
        const a = o.points[i], b = o.points[(i + 1) % o.points.length];
        if (o.sign * ((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0])) < -1e-7) { inside = false; break; }
      }
      if (inside) return true;
    }
    return false;
  }
  function clip(face) {
    const b = boundsOf(face), nearby = candidates(b.minX, b.minZ, b.maxX, b.maxZ);
    let pieces = [face];
    for (const o of nearby) {
      const next = [];
      for (const piece of pieces) {
        let remaining = piece;
        for (let i = 0; i < o.points.length && remaining.length >= 3; i++) {
          const cut = split(remaining, o.points[i], o.points[(i + 1) % o.points.length], o.sign);
          if (cut.outside.length >= 3) next.push(cut.outside);
          remaining = cut.inside;
        }
      }
      pieces = next;
    }
    return pieces;
  }
  function cutGeometry(geometry) {
    if (!openings.length) return geometry;
    geometry.computeBoundingBox();
    const b = geometry.boundingBox;
    if (!intersects(b.min.x, b.min.z, b.max.x, b.max.z)) return geometry;
    const p = geometry.attributes.position, attrs = Object.entries(geometry.attributes).filter(([name]) => name !== 'position'), index = geometry.index;
    const indices = [], added = [], extras = attrs.map(() => []);
    for (let i = 0; i < (index?.count || p.count); i += 3) {
      const a = index ? index.getX(i) : i, b = index ? index.getX(i + 1) : i + 1, c = index ? index.getX(i + 2) : i + 2;
      if (!intersects(Math.min(p.getX(a), p.getX(b), p.getX(c)), Math.min(p.getZ(a), p.getZ(b), p.getZ(c)), Math.max(p.getX(a), p.getX(b), p.getX(c)), Math.max(p.getZ(a), p.getZ(b), p.getZ(c)))) { indices.push(a, b, c); continue; }
      const ids = [a, b, c];
      const face = ids.map((id) => [p.getX(id), p.getZ(id), p.getY(id), ...attrs.flatMap(([, a]) => Array.from(a.array.subarray(id * a.itemSize, (id + 1) * a.itemSize)))]);
      for (const piece of clip(face)) {
        const first = p.count + added.length / 3;
        for (const v of piece) {
          added.push(v[0], v[2], v[1]);
          let offset = 3;
          for (let j = 0; j < attrs.length; j++) { const size = attrs[j][1].itemSize; extras[j].push(...v.slice(offset, offset + size)); offset += size; }
        }
        for (let j = 1; j + 1 < piece.length; j++) indices.push(first, first + j, first + j + 1);
      }
    }
    if (added.length) {
      const values = new Float32Array(p.array.length + added.length); values.set(p.array); values.set(added, p.array.length);
      geometry.setAttribute('position', new THREE.BufferAttribute(values, 3));
      for (let j = 0; j < attrs.length; j++) {
        const [name, a] = attrs[j], values = new a.array.constructor(a.array.length + extras[j].length); values.set(a.array); values.set(extras[j], a.array.length);
        geometry.setAttribute(name, new THREE.BufferAttribute(values, a.itemSize, a.normalized));
      }
    }
    geometry.setIndex(indices); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
  }
  return { clip, cutGeometry, contains, intersects, count: openings.length };
}
