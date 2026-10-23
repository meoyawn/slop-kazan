/** Spatially index surface lots without treating public streets crossing their bounds as parking aisles. */
export function createParkingIndex(areas) {
  const grid = new Map(), cell = 128;
  for (const area of areas) {
    const xs = area.rings.flatMap((r) => r.filter((_, i) => i % 2 === 0));
    const zs = area.rings.flatMap((r) => r.filter((_, i) => i % 2 === 1));
    area.bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
    const b = area.bounds;
    for (let x = Math.floor(b.minX / cell); x <= Math.floor(b.maxX / cell); x++) {
      for (let z = Math.floor(b.minZ / cell); z <= Math.floor(b.maxZ / cell); z++) {
        const key = `${x},${z}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(area);
      }
    }
  }
  function inside(ring, x, z) {
    let result = false;
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      if ((ring[i + 1] > z) !== (ring[j + 1] > z) && x < (ring[j] - ring[i]) * (z - ring[i + 1]) / (ring[j + 1] - ring[i + 1]) + ring[i]) result = !result;
    }
    return result;
  }
  function at(x, z) {
    for (const area of grid.get(`${Math.floor(x / cell)},${Math.floor(z / cell)}`) || []) {
      if (area.rings.some((r) => inside(r, x, z)) && !area.holes.some((r) => inside(r, x, z))) return area;
    }
    return null;
  }
  function crossings(a, b) {
    const candidates = new Set(), cuts = [0, 1], dx = b[0] - a[0], dz = b[1] - a[1];
    for (let x = Math.floor(Math.min(a[0], b[0]) / cell); x <= Math.floor(Math.max(a[0], b[0]) / cell); x++) {
      for (let z = Math.floor(Math.min(a[1], b[1]) / cell); z <= Math.floor(Math.max(a[1], b[1]) / cell); z++) {
        for (const area of grid.get(`${x},${z}`) || []) candidates.add(area);
      }
    }
    for (const area of candidates) for (const ring of [...area.rings, ...area.holes]) {
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const ex = ring[i] - ring[j], ez = ring[i + 1] - ring[j + 1], denominator = dx * ez - dz * ex;
        if (Math.abs(denominator) < 1e-9) continue;
        const qx = ring[j] - a[0], qz = ring[j + 1] - a[1];
        const t = (qx * ez - qz * ex) / denominator, u = (qx * dz - qz * dx) / denominator;
        if (t > 1e-7 && t < 1 - 1e-7 && u >= -1e-7 && u <= 1 + 1e-7) cuts.push(t);
      }
    }
    return cuts.sort((a, b) => a - b).filter((t, i, sorted) => !i || t - sorted[i - 1] > 1e-7);
  }
  return { at, crossings };
}

/** Keep geometry for access/player movement while omitting only parking portions from ambient traffic. */
export const splitParkingAccess = (road, index) => splitAreaAccess(road, index, 'parking', !!road.parkingAisle);

/** Split internal access at mapped facility boundaries while keeping outside connections and public roads. */
export function splitAreaAccess(road, index, property, forced = false) {
  if (forced || !road.service) return [{ pts: road.pts, nodes: road.nodes, [property]: forced }];
  const pieces = [];
  let current = null;
  for (let i = 1; i < road.pts.length; i++) {
    const a = road.pts[i - 1], b = road.pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const cuts = index.crossings(a, b);
    for (let k = 1; k < cuts.length; k++) {
      const lo = cuts[k - 1], hi = cuts[k], mid = (lo + hi) / 2;
      const enclosed = !!index.at(a[0] + dx * mid, a[1] + dz * mid);
      const start = [Math.round((a[0] + dx * lo) * 10) / 10, Math.round((a[1] + dz * lo) * 10) / 10];
      const end = [Math.round((a[0] + dx * hi) * 10) / 10, Math.round((a[1] + dz * hi) * 10) / 10];
      if (Math.hypot(start[0] - end[0], start[1] - end[1]) < 0.1) continue;
      const firstId = lo === 0 ? road.nodes[i - 1] : `${property}/${road.id}/${i}/${lo.toFixed(7)}`;
      const lastId = hi === 1 ? road.nodes[i] : `${property}/${road.id}/${i}/${hi.toFixed(7)}`;
      if (!current || current[property] !== enclosed || current.nodes.at(-1) !== firstId) {
        current = { pts: [start], nodes: [firstId], [property]: enclosed }; pieces.push(current);
      }
      current.pts.push(end); current.nodes.push(lastId);
    }
  }
  return pieces;
}
