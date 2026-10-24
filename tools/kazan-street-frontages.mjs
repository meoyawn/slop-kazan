import { polygonContains, polygonBounds } from '../js/footprints.js';

function straightFronts(ring) {
  const points = [];
  for (let i = 0; i < ring.length; i += 2) points.push([ring[i], ring[i + 1]]);
  let changed = true;
  while (changed && points.length > 3) {
    changed = false;
    for (let i = 0; i < points.length; i++) {
      const a = points[(i + points.length - 1) % points.length], b = points[i], c = points[(i + 1) % points.length];
      const dx = c[0] - a[0], dz = c[1] - a[1], length = Math.hypot(dx, dz);
      const t = ((b[0] - a[0]) * dx + (b[1] - a[1]) * dz) / length ** 2;
      if (length > 0.1 && t > 0 && t < 1 && Math.abs((b[0] - a[0]) * dz - (b[1] - a[1]) * dx) / length < 0.15) {
        points.splice(i, 1); changed = true; break;
      }
    }
  }
  return points.flat();
}

/** Offline frontage evidence: alignment and a clear facade-to-street sightline, never a district/address whitelist. */
export function createStreetFrontages(roads, buildings) {
  if (!roads.length) return () => null;
  const size = 128, streets = new Map(), bodies = new Map();
  function insert(index, item, bounds) {
    for (let x = Math.floor(bounds.minX / size); x <= Math.floor(bounds.maxX / size); x++) {
      for (let z = Math.floor(bounds.minZ / size); z <= Math.floor(bounds.maxZ / size); z++) {
        const key = `${x},${z}`; if (!index.has(key)) index.set(key, []); index.get(key).push(item);
      }
    }
  }
  for (const road of roads) {
    if (!/^(primary|secondary|tertiary|residential)$/.test(road.kind) || road.bridge || road.tunnel || road.layer || road.walk) continue;
    for (let i = 2; i < road.pts.length; i += 2) {
      const ax = road.pts[i - 2], az = road.pts[i - 1], bx = road.pts[i], bz = road.pts[i + 1];
      if (Math.hypot(bx - ax, bz - az) < 1) continue;
      insert(streets, { road, ax, az, bx, bz }, { minX: Math.min(ax, bx) - 55, maxX: Math.max(ax, bx) + 55, minZ: Math.min(az, bz) - 55, maxZ: Math.max(az, bz) + 55 });
    }
  }
  for (const b of buildings) if (b.h >= 5) insert(bodies, b, polygonBounds(b.ring));
  function blocked(b, ax, az, bx, bz) {
    const seen = new Set();
    for (let x = Math.floor(Math.min(ax, bx) / size); x <= Math.floor(Math.max(ax, bx) / size); x++) {
      for (let z = Math.floor(Math.min(az, bz) / size); z <= Math.floor(Math.max(az, bz) / size); z++) {
        for (const other of bodies.get(`${x},${z}`) || []) {
          if (seen.has(other)) continue; seen.add(other);
          if (other.id === b.id && other.osmType === b.osmType || other.parent === `${b.osmType}/${b.id}`) continue;
          if (polygonContains(other.ring, (ax + bx) / 2, (az + bz) / 2)) return true;
          for (let i = 0, j = other.ring.length - 2; i < other.ring.length; j = i, i += 2) {
            const cx = other.ring[j], cz = other.ring[j + 1], ex = other.ring[i] - cx, ez = other.ring[i + 1] - cz;
            const dx = bx - ax, dz = bz - az, determinant = dx * ez - dz * ex;
            if (Math.abs(determinant) < 1e-8) continue;
            const t = ((cx - ax) * ez - (cz - az) * ex) / determinant, u = ((cx - ax) * dz - (cz - az) * dx) / determinant;
            if (t > 0.02 && t < 0.98 && u >= 0 && u <= 1) return true;
          }
        }
      }
    }
    return false;
  }
  return function frontage(b) {
    let best = null;
    const faces = new Map();
    const ring = straightFronts(b.ring);
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const ax = ring[j], az = ring[j + 1], dx = ring[i] - ax, dz = ring[i + 1] - az, length = Math.hypot(dx, dz);
      if (length < 35) continue;
      const x = ax + dx / 2, z = az + dz / 2, ux = dx / length, uz = dz / length;
      let nx = -uz, nz = ux;
      if (polygonContains(b.ring, x + nx * 0.2, z + nz * 0.2)) { nx = -nx; nz = -nz; }
      for (const s of streets.get(`${Math.floor(x / size)},${Math.floor(z / size)}`) || []) {
        const rx = s.bx - s.ax, rz = s.bz - s.az, rLength = Math.hypot(rx, rz);
        if (Math.abs((rx * ux + rz * uz) / rLength) < 0.9) continue;
        const fraction = Math.max(0, Math.min(1, ((x - s.ax) * rx + (z - s.az) * rz) / rLength ** 2));
        const px = s.ax + rx * fraction, pz = s.az + rz * fraction, distance = Math.hypot(px - x, pz - z), setback = distance - s.road.w / 2;
        if ((px - x) * nx + (pz - z) * nz <= 0 || setback < 0 || setback > 35) continue;
        const a = (s.ax - ax) * ux + (s.az - az) * uz, c = (s.bx - ax) * ux + (s.bz - az) * uz;
        const overlap = Math.min(length, Math.max(a, c)) - Math.max(0, Math.min(a, c));
        if (overlap < Math.min(30, length * 0.6)) continue;
        let clear = 0;
        for (const fraction of [0.25, 0.5, 0.75]) {
          const fx = ax + dx * fraction, fz = az + dz * fraction;
          const t = Math.max(0, Math.min(1, ((fx - s.ax) * rx + (fz - s.az) * rz) / rLength ** 2));
          if (!blocked(b, fx + nx * 0.2, fz + nz * 0.2, s.ax + rx * t, s.az + rz * t)) clear++;
        }
        if (clear < 2) continue;
        const evidence = { road: `way/${s.road.id}`, kind: s.road.kind, frontage: Math.round(length), setback: Math.round(setback * 10) / 10,
          yaw: -Math.atan2(dz, dx), ax, az, bx: ring[i], bz: ring[i + 1], nx, nz };
        const faceKey = `${ax},${az}`;
        if (!faces.has(faceKey) || setback < faces.get(faceKey).setback) faces.set(faceKey, evidence);
        if (s.road.kind !== 'residential' && (!best || setback < best.setback)) best = evidence;
      }
    }
    return best ? { ...best, faces: [...faces.values()] } : null;
  };
}
