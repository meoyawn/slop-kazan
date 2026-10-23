import { compileRailways } from './kazan-railways.mjs';

/** Tram route membership and track beds retain source direction, stop order and independent topology. */
export function compileTrams(elements, geometry, roads, routeSource) {
  const data = compileRailways(elements, { ...geometry, mode: 'tram' }), roadCells = new Map(), size = 128;
  for (const road of roads) {
    if (road.walk) continue;
    for (let i = 2; i < road.pts.length; i += 2) {
      const a = road.pts.slice(i - 2, i), b = road.pts.slice(i, i + 2), margin = road.w / 2 + 3;
      for (let x = Math.floor((Math.min(a[0], b[0]) - margin) / size); x <= Math.floor((Math.max(a[0], b[0]) + margin) / size); x++) {
        for (let z = Math.floor((Math.min(a[1], b[1]) - margin) / size); z <= Math.floor((Math.max(a[1], b[1]) + margin) / size); z++) {
          const key = `${x},${z}`;
          if (!roadCells.has(key)) roadCells.set(key, []);
          roadCells.get(key).push({ road, a, b });
        }
      }
    }
  }
  const originals = new Map(elements.map((e) => [`${e.type}/${e.id}`, e]));
  for (const t of data.tracks) {
    const source = originals.get(`way/${t.id}`).tags;
    t.length = 0; t.bedSpans = [];
    for (let i = 2; i < t.pts.length; i += 2) {
      const a = t.pts.slice(i - 2, i), b = t.pts.slice(i, i + 2), length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const count = Math.max(1, Math.ceil(length / 4));
      for (let j = 0; j < count; j++) {
        const x = a[0] + (b[0] - a[0]) * (j + 0.5) / count, z = a[1] + (b[1] - a[1]) * (j + 0.5) / count;
        let embedded = source.embedded_rails === 'yes', roadId;
        for (const item of roadCells.get(`${Math.floor(x / size)},${Math.floor(z / size)}`) || []) {
          const r = item.road;
          if (r.layer !== t.layer || !!r.bridge !== t.bridge || !!r.tunnel !== t.tunnel) continue;
          const dx = item.b[0] - item.a[0], dz = item.b[1] - item.a[1];
          const u = Math.max(0, Math.min(1, ((x - item.a[0]) * dx + (z - item.a[1]) * dz) / (dx * dx + dz * dz || 1)));
          if (Math.hypot(x - item.a[0] - dx * u, z - item.a[1] - dz * u) < r.w / 2 + 0.4) { embedded = true; roadId = r.id; break; }
        }
        if (t.tunnel && source.embedded_rails !== 'yes') { embedded = false; roadId = undefined; }
        const bed = embedded ? 'embedded' : 'reserved', end = t.length + length * (j + 1) / count, last = t.bedSpans.at(-1);
        if (last && last.bed === bed && last.roadId === roadId) last.end = end;
        else t.bedSpans.push({ start: t.length + length * j / count, end, bed, roadId,
          source: source.embedded_rails ? 'osm' : t.tunnel ? 'underpass-reserved-estimate' : 'geometry-inferred' });
      }
      t.length += length;
    }
  }
  const byId = new Map(data.tracks.map((t, i) => [t.id, i])), routes = [];
  for (const r of routeSource.routes) {
    const parts = [], gaps = [], missingWays = [];
    let length = 0;
    for (const member of r.members) {
      if (member.type !== 'way' || /platform/.test(member.role)) continue;
      const index = byId.get(member.ref);
      if (index === undefined) { missingWays.push(member.ref); continue; }
      const t = data.tracks[index], previous = parts.at(-1), endNode = previous ? data.tracks[previous.track].nodes.at(-1) : null;
      if (previous && endNode !== t.nodes[0]) gaps.push({ before: previous.track, after: index });
      parts.push({ track: index, start: length, length: t.length }); length += t.length;
    }
    const stops = [];
    for (const member of r.members) {
      if (member.type !== 'node' || !/^stop/.test(member.role)) continue;
      const e = originals.get(`node/${member.ref}`);
      if (!e) continue;
      const [x, z] = geometry.toWorld(e);
      let best = null;
      for (const part of parts) {
        const t = data.tracks[part.track]; let travelled = 0;
        for (let i = 2; i < t.pts.length; i += 2) {
          const ax = t.pts[i - 2], az = t.pts[i - 1], dx = t.pts[i] - ax, dz = t.pts[i + 1] - az, span = Math.hypot(dx, dz);
          const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (span ** 2 || 1)));
          const distance = Math.hypot(x - ax - dx * u, z - az - dz * u);
          if (!best || distance < best.distance) best = { distance, s: part.start + travelled + span * u, track: part.track };
          travelled += span;
        }
      }
      if (best && best.distance < 40) stops.push({ id: member.ref, name: e.tags?.name || '', s: best.s, track: best.track, source: `https://www.openstreetmap.org/node/${member.ref}` });
    }
    if (!parts.length) continue;
    const last = data.tracks[parts.at(-1).track], first = data.tracks[parts[0].track];
    routes.push({ id: r.id, ref: r.tags.ref || '', name: r.tags.name || '', from: r.tags.from || '', to: r.tags.to || '',
      operator: r.tags.operator || '', parts, stops: stops.sort((a, b) => a.s - b.s), length,
      loop: last.nodes.at(-1) === first.nodes[0], gaps, missingWays,
      serviceSource: 'mapped-route-demonstration', source: `https://www.openstreetmap.org/relation/${r.id}` });
  }
  return { ...data, routes, source: routeSource.source,
    bedClassification: 'Mapped tags where available; otherwise road-envelope overlap sampled every 4 m, including at-grade crossing pavement. Inferred beds remain separate from photographic verification.' };
}
