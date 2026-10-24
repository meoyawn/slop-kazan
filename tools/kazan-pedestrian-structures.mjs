const pedestrian = new Set(['footway', 'path', 'steps', 'pedestrian', 'cycleway']);
const elevated = (tags) => tags.bridge && tags.bridge !== 'no';
const belowGround = (tags) => tags.tunnel === 'yes' || tags.location === 'underground' || Number.parseFloat(tags.layer) < 0;

function lengthOf(points) {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return length;
}

function crossing(a, b, c, d) {
  const dx = b[0] - a[0], dz = b[1] - a[1], ex = d[0] - c[0], ez = d[1] - c[1], denominator = dx * ez - dz * ex;
  if (Math.abs(denominator) < 1e-8) return null;
  const t = ((c[0] - a[0]) * ez - (c[1] - a[1]) * ex) / denominator;
  const u = ((c[0] - a[0]) * dz - (c[1] - a[1]) * dx) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + t * dx, a[1] + t * dz] : null;
}

function inside(ring, x, z) {
  let hit = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    if ((ring[i + 1] > z) !== (ring[j + 1] > z) && x < (ring[j] - ring[i]) * (z - ring[i + 1]) / (ring[j + 1] - ring[i + 1]) + ring[i]) hit = !hit;
  }
  return hit;
}

/** Retain actual shared-node topology; geometric intersections never join separate walking levels. */
export function compilePedestrianStructures(elements, { toWorld, clipRoad, underground = false, buildings = [] }, roads) {
  const candidates = [], atNode = new Map(), selected = new Set();
  const metroNodes = new Set(elements.filter((e) => e.type === 'node' && e.tags?.railway === 'subway_entrance').map((e) => e.id));
  function core(tags, nodes) { return underground ? belowGround(tags) || tags.highway === 'steps' && nodes.some((id) => metroNodes.has(id)) : elevated(tags); }
  for (const e of elements) {
    if (e.type !== 'way' || !e.geometry || !pedestrian.has(e.tags?.highway) || e.tags.area === 'yes' || e.tags.indoor === 'yes') continue;
    if (underground ? elevated(e.tags) || Number.parseFloat(e.tags.layer) > 0 : e.tags.tunnel === 'yes') continue;
    for (const piece of clipRoad(e.geometry.map(toWorld), e.nodes, e.id)) {
      const index = candidates.length, tags = e.tags, length = lengthOf(piece.pts);
      const path = { id: e.id, nodeIds: piece.nodes, points: piece.pts, length, tags };
      candidates.push(path);
      for (const id of piece.nodes) {
        if (!atNode.has(id)) atNode.set(id, []);
        atNode.get(id).push(index);
      }
      if (core(tags, piece.nodes)) selected.add(index);
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    const additions = new Set();
    for (const index of selected) for (const id of candidates[index].nodeIds) {
      for (const next of atNode.get(id) || []) {
        if (selected.has(next)) continue;
        const p = candidates[next], tags = p.tags;
        const ramp = tags.incline && tags.incline !== 'no' && tags.incline !== '0' || tags.ramp === 'yes';
        const otherEnds = [p.nodeIds[0], p.nodeIds.at(-1)].filter((end) => end !== id);
        const joinsStair = otherEnds.some((end) => (atNode.get(end) || []).some((i) => candidates[i].tags.highway === 'steps' || elevated(candidates[i].tags)));
        if (tags.highway === 'steps' && p.length < 180 || ramp && p.length < 180 || p.length < 22 && joinsStair) additions.add(next);
      }
    }
    if (!additions.size) break;
    for (const index of additions) selected.add(index);
  }
  const parents = new Map([...selected].map((i) => [i, i]));
  function root(i) {
    let current = i;
    while (parents.get(current) !== current) current = parents.get(current);
    return current;
  }
  for (const members of atNode.values()) {
    const retained = members.filter((i) => selected.has(i));
    for (let i = 1; i < retained.length; i++) parents.set(root(retained[i]), root(retained[0]));
  }
  const roadCells = new Map();
  for (const [index, road] of roads.entries()) {
    if (road.walk) continue;
    for (let i = 2; i < road.pts.length; i += 2) {
      const a = road.pts.slice(i - 2, i), b = road.pts.slice(i, i + 2), segment = { a, b, index, road };
      for (let x = Math.floor(Math.min(a[0], b[0]) / 128); x <= Math.floor(Math.max(a[0], b[0]) / 128); x++) {
        for (let z = Math.floor(Math.min(a[1], b[1]) / 128); z <= Math.floor(Math.max(a[1], b[1]) / 128); z++) {
          const key = `${x},${z}`;
          if (!roadCells.has(key)) roadCells.set(key, []);
          roadCells.get(key).push(segment);
        }
      }
    }
  }
  const groups = new Map(), roadIndices = new Map();
  for (const [index, r] of roads.entries()) {
    if (!roadIndices.has(r.id)) roadIndices.set(r.id, []);
    roadIndices.get(r.id).push(index);
  }
  for (const index of selected) {
    const groupId = root(index), p = candidates[index];
    if (!groups.has(groupId)) groups.set(groupId, []);
    groups.get(groupId).push(p);
  }
  const structures = [];
  for (const members of groups.values()) {
    const bridgeMembers = members.filter((p) => core(p.tags, p.nodeIds)), crossed = new Map(), sharedRoads = new Set();
    let spanLength = 0, sharedLength = 0;
    for (const p of bridgeMembers) for (let i = 1; i < p.points.length; i++) {
      const a = p.points[i - 1], b = p.points[i], nearby = new Set();
      const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz), layer = Number.parseFloat(p.tags.layer) || (underground ? -1 : 1);
      let shared = false;
      spanLength += length;
      for (let x = Math.floor((Math.min(a[0], b[0]) - 35) / 128); x <= Math.floor((Math.max(a[0], b[0]) + 35) / 128); x++) {
        for (let z = Math.floor((Math.min(a[1], b[1]) - 35) / 128); z <= Math.floor((Math.max(a[1], b[1]) + 35) / 128); z++) {
          for (const segment of roadCells.get(`${x},${z}`) || []) nearby.add(segment);
        }
      }
      for (const segment of nearby) {
        const ex = segment.b[0] - segment.a[0], ez = segment.b[1] - segment.a[1], roadLength = Math.hypot(ex, ez);
        if (!underground && segment.road.bridge && segment.road.layer === layer && length && roadLength && Math.abs((dx * ex + dz * ez) / (length * roadLength)) > 0.95) {
          const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
          const t = Math.max(0, Math.min(1, ((mx - segment.a[0]) * ex + (mz - segment.a[1]) * ez) / roadLength ** 2));
          if (Math.hypot(mx - segment.a[0] - t * ex, mz - segment.a[1] - t * ez) < segment.road.w / 2 + 8) { sharedRoads.add(segment.index); shared = true; }
        }
        const point = crossing(a, b, segment.a, segment.b);
        if (!point || (underground ? (segment.road.layer || 0) <= layer : (segment.road.layer || 0) >= layer) || segment.road.tunnel) continue;
        const key = `${segment.road.id}/${Math.round(point[0])}/${Math.round(point[1])}`;
        crossed.set(key, { roadIndex: segment.index, id: segment.road.id, name: segment.road.localName || segment.road.name, x: point[0], z: point[1] });
      }
      if (shared) sharedLength += length;
    }
    const allPoints = members.flatMap((p) => p.points), xs = allPoints.map((p) => p[0]), zs = allPoints.map((p) => p[1]);
    const boardwalk = bridgeMembers.every((p) => p.tags.bridge === 'boardwalk'), kind = underground ? 'underpass' : boardwalk ? 'boardwalk' : sharedLength > spanLength * 0.5 ? 'road-sidewalk' : crossed.size ? 'road-overpass' : 'footbridge';
    const id = Math.min(...bridgeMembers.map((p) => p.id)), paths = members.map((p) => {
      const tags = p.tags, bridge = !!elevated(tags), stairs = tags.highway === 'steps';
      const role = stairs ? 'stairs' : underground && belowGround(tags) ? 'tunnel' : bridge ? 'span' : tags.incline || tags.ramp === 'yes' ? 'ramp' : 'landing';
      return { id: p.id, nodeIds: p.nodeIds, pts: p.points.flat(), roadIndices: roadIndices.get(p.id) || [], role, bridge,
        width: Math.max(1.5, Math.min(12, Number.parseFloat(tags.width) || 2.5)), widthSource: tags.width ? 'osm-width' : 'procedural-estimate',
        layer: Number(tags.layer) || (bridge ? 1 : underground && belowGround(tags) ? -1 : 0), covered: tags.covered === 'yes' || role === 'tunnel' || tags.covered !== 'no' && kind === 'road-overpass',
        coverSource: tags.covered ? 'osm-covered' : kind === 'road-overpass' ? 'recurring-family-estimate' : 'open-family-estimate',
        stepCount: Number.parseInt(tags.step_count, 10) || undefined, incline: tags.incline, access: tags.access, foot: tags.foot,
        source: `https://www.openstreetmap.org/way/${p.id}` };
    });
    const surfaceNodes = underground ? [...new Set(members.flatMap((p) => p.nodeIds).filter((id) => (atNode.get(id) || []).some((i) => !selected.has(i) && !belowGround(candidates[i].tags))))] : undefined;
    structures.push({ id, kind, underground: underground || undefined, surfaceNodes, x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2,
      bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }, paths, crossedRoads: [...crossed.values()], sharedRoadIndices: [...sharedRoads],
      levelSource: 'clearance-and-connected-stair-estimate', unresolved: ['Engineering elevations, support positions and untagged enclosures are procedural estimates.'] });
  }
  const liftNodes = elements.filter((e) => e.type === 'node' && e.tags?.highway === 'elevator').map((e) => {
    const [x, z] = toWorld(e);
    return { id: e.id, x, z, levels: e.tags.level, source: `https://www.openstreetmap.org/node/${e.id}` };
  });
  for (const s of structures) {
    const ids = new Set(s.paths.flatMap((p) => p.nodeIds));
    s.lifts = liftNodes.filter((e) => ids.has(e.id));
  }
  const entries = underground ? elements.filter((e) => e.type === 'node' && e.tags?.railway === 'subway_entrance').map((e) => {
    const [x, z] = toWorld(e);
    return { id: e.id, x, z, name: e.tags.name || '', ref: e.tags.ref, source: `https://www.openstreetmap.org/node/${e.id}` };
  }) : [];
  const matchedEntries = new Set();
  if (underground) for (const s of structures) {
    const ids = new Set(s.paths.flatMap((p) => p.nodeIds));
    s.entries = entries.filter((e) => ids.has(e.id));
    for (const e of s.entries) matchedEntries.add(e.id);
    if (s.entries.length) s.kind = 'subway-access';
  }
  const roofBindings = [];
  if (underground) for (const b of buildings) {
    if (b.kind !== 'roof' || b.part || b.model || b.fuelRole) continue;
    const bound = { minX: Math.min(...b.ring.filter((_, i) => i % 2 === 0)), maxX: Math.max(...b.ring.filter((_, i) => i % 2 === 0)),
      minZ: Math.min(...b.ring.filter((_, i) => i % 2)), maxZ: Math.max(...b.ring.filter((_, i) => i % 2)) };
    for (const s of structures) {
      if (bound.maxX < s.bounds.minX || bound.minX > s.bounds.maxX || bound.maxZ < s.bounds.minZ || bound.minZ > s.bounds.maxZ) continue;
      const paths = s.paths.filter((p) => p.role === 'stairs' && p.pts.some((_, i) => i >= 2 && i % 2 === 0 && inside(b.ring, (p.pts[i - 2] + p.pts[i]) / 2, (p.pts[i - 1] + p.pts[i + 1]) / 2)));
      if (!paths.length) continue;
      for (const p of paths) { p.covered = true; p.coverSource = 'mapped-entrance-roof'; }
      roofBindings.push({ id: `${b.osmType}/${b.id}`, structure: s.id, paths: paths.map((p) => p.id), ring: b.ring, evidence: 'mapped-roof-over-stairs' });
      break;
    }
  }
  const pavilions = [];
  if (underground) {
    const remaining = new Map(entries.filter((e) => !matchedEntries.has(e.id)).map((e) => [e.id, e]));
    const footprints = new Map(buildings.map((b) => [`${b.osmType}/${b.id}`, b]));
    for (const e of elements) {
      if (e.type !== 'way' || !e.tags?.building || !e.nodes) continue;
      const b = footprints.get(`way/${e.id}`);
      if (!b || b.model) continue;
      for (const node of e.nodes) if (remaining.has(node)) {
        pavilions.push({ entry: remaining.get(node), building: `way/${e.id}`, ring: b.ring, holes: b.holes, h: b.h,
          roofShape: b.roofShape, geometrySource: 'mapped-entry-node-on-building', unresolved: 'Below-ground connection is not mapped; no stairwell opening is invented.' });
      }
    }
  }
  if (underground) return { structures, entries, roofBindings, pavilions, unmatchedEntries: entries.filter((e) => !matchedEntries.has(e.id)),
    sourceUndergroundWays: new Set([...selected].filter((i) => belowGround(candidates[i].tags)).map((i) => candidates[i].id)).size,
    attachedWays: new Set([...selected].filter((i) => !belowGround(candidates[i].tags)).map((i) => candidates[i].id)).size };
  return { structures, sourceBridgeWays: new Set([...selected].filter((i) => elevated(candidates[i].tags)).map((i) => candidates[i].id)).size,
    attachedWays: new Set([...selected].filter((i) => !elevated(candidates[i].tags)).map((i) => candidates[i].id)).size };
}
