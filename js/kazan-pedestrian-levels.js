function roadDistance(road, x, z) {
  let distance = Infinity;
  for (let i = 1; i < road.pts.length; i++) {
    const a = road.pts[i - 1], b = road.pts[i], dx = b.x - a.x, dz = b.z - a.z, span = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (span || 1)));
    distance = Math.min(distance, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
  }
  return distance;
}

/** Mapped access paths share deck endpoints and estimated levels without altering the motor graph. */
export function createPedestrianProfiles(structures, { groundHeight, roads, roadSurface, railCrossingHeight }) {
  const result = [];
  for (const source of structures) {
    const nodes = new Map(), adjacent = new Map(), upper = new Set();
    let deck = -Infinity;
    for (const path of source.paths) for (let i = 0; i < path.nodeIds.length; i++) {
      const id = path.nodeIds[i], x = path.pts[i * 2], z = path.pts[i * 2 + 1];
      if (!nodes.has(id)) { nodes.set(id, { id, x, z, y: groundHeight(x, z), fixed: false }); adjacent.set(id, []); }
      if (path.role === 'span') { upper.add(id); deck = Math.max(deck, groundHeight(x, z) + 0.3); }
      if (!i) continue;
      const previous = path.nodeIds[i - 1], length = Math.hypot(x - path.pts[(i - 1) * 2], z - path.pts[(i - 1) * 2 + 1]);
      adjacent.get(id).push({ id: previous, length }); adjacent.get(previous).push({ id, length });
    }
    if (source.kind === 'road-overpass') for (const r of source.crossedRoads) deck = Math.max(deck, roadSurface(r.roadIndex, r.x, r.z) + 6.5);
    if (railCrossingHeight && source.kind !== 'road-sidewalk') for (const path of source.paths) {
      if (path.role !== 'span') continue;
      for (let i = 2; i < path.pts.length; i += 2) {
        const x = path.pts[i - 2], z = path.pts[i - 1], dx = path.pts[i] - x, dz = path.pts[i + 1] - z, length = Math.hypot(dx, dz);
        if (!length) continue;
        const count = Math.max(1, Math.ceil(length / 3));
        for (let j = 0; j <= count; j++) {
          const rail = railCrossingHeight(x + dx * j / count, z + dz * j / count, dx / length, dz / length, path.layer);
          if (Number.isFinite(rail)) deck = Math.max(deck, rail + 6.5);
        }
      }
    }
    for (const id of upper) {
      const n = nodes.get(id);
      n.y = source.kind === 'boardwalk' ? Math.max(0.25, groundHeight(n.x, n.z) + 0.25) : Math.max(0.3, deck);
      if (source.kind === 'road-sidewalk') {
        let nearest = null, distance = Infinity;
        for (const index of source.sharedRoadIndices) {
          const d = roadDistance(roads[index], n.x, n.z);
          if (d < distance) { distance = d; nearest = index; }
        }
        if (nearest !== null) n.y = roadSurface(nearest, n.x, n.z);
      }
      n.fixed = true;
    }
    for (let pass = 0; pass < source.paths.length; pass++) {
      let changed = false;
      for (const p of source.paths) {
        if (p.role !== 'landing' || !p.nodeIds.some((id) => upper.has(id))) continue;
        const anchor = nodes.get(p.nodeIds.find((id) => upper.has(id)));
        for (const id of p.nodeIds) if (!upper.has(id)) { upper.add(id); nodes.get(id).y = anchor.y; nodes.get(id).fixed = true; changed = true; }
      }
      if (!changed) break;
    }
    for (const n of nodes.values()) if (!n.fixed && adjacent.get(n.id).length === 1) n.fixed = true;
    for (let iteration = 0; iteration < 600; iteration++) {
      let change = 0;
      for (const n of nodes.values()) {
        if (n.fixed) continue;
        let total = 0, weights = 0;
        for (const edge of adjacent.get(n.id)) {
          const weight = 1 / Math.max(0.1, edge.length);
          total += nodes.get(edge.id).y * weight; weights += weight;
        }
        const y = weights ? total / weights : n.y;
        change = Math.max(change, Math.abs(y - n.y)); n.y = y;
      }
      if (change < 1e-5) break;
    }
    const paths = source.paths.map((p) => {
      const points = p.nodeIds.map((id) => nodes.get(id)), segments = [];
      let length = 0;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i], span = Math.hypot(b.x - a.x, b.z - a.z);
        if (span < 0.01) continue;
        segments.push({ a, b, length: span, start: length, treadCount: 0 }); length += span;
      }
      for (const segment of segments) if (p.role === 'stairs' && Math.abs(segment.b.y - segment.a.y) > 0.02) {
        const mapped = p.stepCount ? Math.round(p.stepCount * segment.length / length) : 0;
        segment.treadCount = Math.max(1, Math.min(600, Math.max(mapped, Math.ceil(Math.abs(segment.b.y - segment.a.y) / 0.17))));
      }
      return { ...p, points, segments, length };
    });
    result.push({ ...source, paths });
  }
  return result;
}

/** The same horizontal tread heights supply rendered steps and walking feet. */
export function samplePedestrianSegment(segment, t) {
  const dy = segment.b.y - segment.a.y, count = segment.treadCount;
  const u = Math.max(0, Math.min(1, t));
  if (!count) return segment.a.y + dy * u;
  const index = dy >= 0 ? Math.ceil(u * count) : Math.floor(u * count);
  return segment.a.y + dy * index / count;
}

export function pedestrianPathSample(path, x, z) {
  let best = null;
  for (const segment of path.segments) {
    const { a, b, length } = segment, dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / length ** 2));
    const distance = Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
    if (!best || distance < best.distance) best = { y: samplePedestrianSegment(segment, t), distance, segment, t };
  }
  return best;
}
