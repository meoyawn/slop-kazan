/** Compile railway topology independently of the motor graph. OSM ways denote individual tracks unless explicitly tagged otherwise. */
export function compileRailways(elements, { toWorld, clipRoad, closedRing, joinMembers }) {
  const tracks = [], nodes = [], links = [], nodeIndex = new Map();
  function node(id, point) {
    if (!nodeIndex.has(id)) {
      nodeIndex.set(id, nodes.length);
      nodes.push({ id, x: point[0], z: point[1] });
    }
    return nodeIndex.get(id);
  }
  for (const e of elements) {
    const t = e.tags || {};
    if (e.type !== 'way' || !e.geometry || !['rail', 'narrow_gauge'].includes(t.railway)) continue;
    const gauge = t.gauge ? t.gauge.split(';').map(Number).filter((g) => g > 0) : [t.railway === 'narrow_gauge' ? 750 : 1520];
    if (!gauge.length) throw new Error(`Invalid railway gauge: way/${e.id}`);
    for (const piece of clipRoad(e.geometry.map(toWorld), e.nodes, e.id)) {
      const index = tracks.length;
      const ids = piece.pts.map((p, i) => node(piece.nodes[i], p));
      const track = { id: e.id, osmType: 'way', kind: t.railway, name: t.name || '', ref: t.ref || '',
        pts: piece.pts.flat(), nodes: ids, gauge, gaugeSource: t.gauge ? 'osm' : 'regional-estimate',
        tracks: Math.max(1, parseInt(t.tracks, 10) || 1), tracksSource: t.tracks ? 'osm' : 'osm-single-track-way',
        electrified: t.electrified || 'unknown', voltage: t.voltage || '', frequency: t.frequency || '',
        service: t.service || '', usage: t.usage || '', access: t.access || 'unknown',
        operator: t.operator || '', maxspeed: t.maxspeed || '', trackRef: t['railway:track_ref'] || '',
        bridge: !!t.bridge && t.bridge !== 'no', tunnel: !!t.tunnel && t.tunnel !== 'no',
        layer: Number(t.layer) || 0, direction: t.oneway === '-1' ? -1 : t.oneway === 'yes' ? 1 : 0,
        source: `https://www.openstreetmap.org/way/${e.id}` };
      tracks.push(track);
      for (let i = 1; i < ids.length; i++) {
        const a = nodes[ids[i - 1]], b = nodes[ids[i]], length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length > 0) links.push({ a: ids[i - 1], b: ids[i], track: index, length, direction: track.direction });
      }
    }
  }
  const cells = new Map(), cellSize = 128;
  for (const link of links) {
    const a = nodes[link.a], b = nodes[link.b];
    for (let x = Math.floor((Math.min(a.x, b.x) - 60) / cellSize); x <= Math.floor((Math.max(a.x, b.x) + 60) / cellSize); x++) {
      for (let z = Math.floor((Math.min(a.z, b.z) - 60) / cellSize); z <= Math.floor((Math.max(a.z, b.z) + 60) / cellSize); z++) {
        const key = `${x},${z}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(link);
      }
    }
  }
  function nearest(x, z) {
    let best = null;
    for (const link of cells.get(`${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`) || []) {
      const a = nodes[link.a], b = nodes[link.b], dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / link.length ** 2));
      const distance = Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
      if (!best || distance < best.distance) best = { track: link.track, distance };
    }
    return best;
  }
  const stations = [], platforms = [], features = [];
  for (const e of elements) {
    const t = e.tags || {}, kind = t.railway;
    if (t.station === 'subway' || t.subway === 'yes' || t.tram === 'yes') continue;
    const source = `https://www.openstreetmap.org/${e.type}/${e.id}`;
    if (kind === 'platform') {
      const rings = e.type === 'way' && e.nodes?.[0] === e.nodes?.at(-1) ? [closedRing(e.geometry)] :
        e.type === 'relation' ? joinMembers(e.members, 'outer').map((g) => closedRing(g)) : [];
      const valid = rings.filter((r) => r.length > 2);
      const points = valid.flat();
      const mapped = points.length ? points : (e.geometry || []).map(toWorld);
      if (!mapped.length) continue;
      const x = mapped.reduce((s, p) => s + p[0], 0) / mapped.length, z = mapped.reduce((s, p) => s + p[1], 0) / mapped.length;
      const near = nearest(x, z);
      if (!near || near.distance > 45) continue;
      platforms.push({ id: e.id, osmType: e.type, name: t.name || '', ref: t.ref || '', rings: valid.map((r) => r.flat()),
        pts: valid.length ? undefined : mapped.flat(), width: parseFloat(t.width) || 4,
        height: parseFloat(t.height) || 0.55, heightSource: t.height ? 'osm' : 'estimate',
        track: near.track, source });
    } else if (e.type === 'node' && ['station', 'halt', 'switch', 'level_crossing', 'crossing', 'buffer_stop', 'signal'].includes(kind)) {
      const [x, z] = toWorld(e), near = nearest(x, z);
      if (!near || near.distance > (kind === 'station' ? 250 : 60)) continue;
      const item = { id: e.id, osmType: 'node', kind, name: t.name || '', ref: t.ref || '', x, z, track: near.track,
        node: nodeIndex.get(e.id), source };
      if (kind === 'station' || kind === 'halt') stations.push(item);
      else features.push(item);
    }
  }
  return { tracks, stations, platforms, features, graph: { nodes, links },
    dimensions: 'Gauge and track count are mapped where tagged. Missing gauges use regional estimates. Sleeper, ballast, catenary and vertical clearances are procedural estimates.' };
}
