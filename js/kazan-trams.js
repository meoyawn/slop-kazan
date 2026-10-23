(function () {
const { THREE, GEO, createRailwayPaths, createKazanRailways } = NYC;
const paths = createRailwayPaths(GEO.trams || { tracks: [], graph: { nodes: [], links: [] }, stations: [], platforms: [], features: [], routes: [] });
const heavyGroundMeshHeight = NYC.railwayGroundMeshHeight;
const trackGroundMeshHeight = (x, z, height) => paths.railwayGroundMeshHeight(x, z, heavyGroundMeshHeight(x, z, height));
const tramCorridorAt = (x, z, clearance = 0) => paths.railwayAt(x, z, clearance, true);

/** Demonstration service follows mapped directed route membership, with bounded fleets and dwell at actual stops. */
function createTramService(network, { vehiclesPerRoute = 2, dwellSeconds = 14, signal = null } = {}) {
  const routes = network.data.routes || [], fleet = [];
  function pose(route, distance) {
    const s = Math.max(0, Math.min(route.length, distance));
    const part = route.parts.find((p) => s <= p.start + p.length) || route.parts.at(-1);
    const track = network.tracks[part.track];
    const direction = part.direction || 1, p = network.trackPoint(track, (part.offset || 0) + direction * (s - part.start));
    return { ...p, dx: p.dx * direction, dz: p.dz * direction, nx: p.nx * direction, nz: p.nz * direction, track, routeDistance: s };
  }
  const adjacency = new Map(), returns = new Map();
  for (const link of network.data.graph.links) {
    const t = network.tracks[link.track];
    if (/^(no|private)$/.test(t.access) || t.service === 'yard') continue;
    for (const [a, b, direction] of [[link.a, link.b, 1], [link.b, link.a, -1]]) {
      if (link.direction && link.direction !== direction) continue;
      if (!adjacency.has(a)) adjacency.set(a, []);
      adjacency.get(a).push({ ...link, a, b, direction });
    }
  }
  function connection(from, to) {
    const distances = new Map([[from, 0]]), previous = new Map(), pending = new Set([from]);
    while (pending.size) {
      let node = null, shortest = Infinity;
      for (const n of pending) if (distances.get(n) < shortest) { node = n; shortest = distances.get(n); }
      pending.delete(node);
      if (node === to) break;
      for (const link of adjacency.get(node) || []) {
        const distance = shortest + link.length;
        if (distance > 1500 || distance >= (distances.get(link.b) ?? Infinity)) continue;
        distances.set(link.b, distance); previous.set(link.b, link); pending.add(link.b);
      }
    }
    if (!distances.has(to)) return null;
    const links = [];
    for (let node = to; node !== from;) { const link = previous.get(node); links.unshift(link); node = link.a; }
    let length = 0;
    const parts = links.map((link) => {
      const t = network.tracks[link.track], part = { track: link.track, start: length, length: link.length,
        offset: t.distances[t.nodes.indexOf(link.a)], direction: link.direction };
      length += link.length; return part;
    });
    return { parts, length };
  }
  for (const route of routes) {
    if (route.loop || route.gaps.length || route.missingWays.length) continue;
    const end = network.tracks[route.parts.at(-1).track].nodes.at(-1);
    let best = null;
    for (const next of routes) {
      if (next === route || next.ref !== route.ref || next.gaps.length || next.missingWays.length ||
          next.parts.some((p) => /^(no|private)$/.test(network.tracks[p.track].access) || network.tracks[p.track].service === 'yard')) continue;
      const start = network.tracks[next.parts[0].track].nodes[0], path = connection(end, start);
      if (path && (!best || path.length < best.path.length)) best = { next, path };
    }
    if (best) returns.set(route.id, best.path.length < 0.01 ? best.next : {
      id: `return/${route.id}`, ref: route.ref, parts: best.path.parts, length: best.path.length, stops: [], gaps: [], missingWays: [], returnTo: best.next });
  }
  for (const route of routes) {
    if (route.gaps.length || route.missingWays.length || route.parts.some((p) => /^(no|private)$/.test(network.tracks[p.track].access) || network.tracks[p.track].service === 'yard')) continue;
    for (let i = 0; i < vehiclesPerRoute; i++) {
      const s = route.length * ((i + 0.13) / vehiclesPerRoute);
      fleet.push({ route, s, speed: 0, wait: 0, nextStop: route.stops.findIndex((p) => p.s > s), finished: false, pose: pose(route, s), state: 'running' });
    }
  }
  function update(dt, elapsed, obstacles = []) {
    const step = Math.max(0, Math.min(0.1, dt));
    for (const v of fleet) {
      if (v.finished) continue;
      if (v.wait > 0) { v.wait = Math.max(0, v.wait - step); v.speed = 0; v.state = 'dwell'; continue; }
      const stop = v.nextStop >= 0 ? v.route.stops[v.nextStop] : null;
      let distance = stop ? Math.max(0, stop.s - v.s) : v.route.length - v.s;
      let state = 'running';
      const current = pose(v.route, v.s), ahead = pose(v.route, Math.min(v.route.length, v.s + 24));
      const dot = Math.max(-1, Math.min(1, current.dx * ahead.dx + current.dz * ahead.dz));
      let target = Math.min(13.9, parseFloat(current.track.maxspeed) / 3.6 || 13.9, Math.max(3, 13.9 * dot * dot));
      if (signal) {
        const restriction = signal(v.route, v.s, elapsed);
        if (restriction && restriction.distance < distance) { distance = restriction.distance; state = 'signal'; }
      }
      for (const other of [...fleet, ...obstacles]) {
        if (other === v || other.finished) continue;
        const p = other.pose || other, dx = p.x - current.x, dz = p.z - current.z;
        const along = dx * current.dx + dz * current.dz, lateral = Math.abs(dx * current.dz - dz * current.dx);
        if (along > 0 && along < 45 && lateral < 2.5 && Math.abs((p.y ?? current.y) - current.y) < 2.5) {
          const gap = Math.max(0, along - (other.route ? 18 : 12));
          if (gap < distance) { distance = gap; state = 'yield'; }
        }
      }
      target = Math.min(target, Math.sqrt(Math.max(0, 2 * 1.5 * distance)));
      v.speed = Math.max(0, v.speed + Math.max(-2.8 * step, Math.min(1.1 * step, target - v.speed)));
      const move = Math.min(distance, v.speed * step), old = v.s;
      v.s += move; v.state = state;
      if (stop && old <= stop.s && v.s >= stop.s - 0.015 && state === 'running') {
        v.s = stop.s; v.wait = dwellSeconds; v.speed = 0; v.nextStop++;
        if (v.nextStop >= v.route.stops.length) v.nextStop = -1;
        v.state = 'dwell';
      }
      if (v.s >= v.route.length - 0.015 && !v.wait) {
        if (v.route.loop) { v.s = 0; v.nextStop = v.route.stops.length ? 0 : -1; }
        else {
          const next = v.route.returnTo || returns.get(v.route.id);
          if (next) { v.route = next; v.s = 0; v.nextStop = next.stops.length ? 0 : -1; v.wait = dwellSeconds; }
          else { v.s = v.route.length; v.finished = true; v.state = 'terminus'; v.speed = 0; }
        }
      }
      v.pose = pose(v.route, v.s);
    }
  }
  function roadGap(vehicle) {
    let gap = Infinity;
    for (const v of fleet) {
      const p = v.pose;
      if (Math.abs(p.y + 0.315 - vehicle.y) > 2.5 || Math.hypot(p.x - vehicle.x, p.z - vehicle.z) > 90) continue;
      const dx = vehicle.x - p.x, dz = vehicle.z - p.z, dot = vehicle.tx * p.dx + vehicle.tz * p.dz;
      const cross = vehicle.tx * p.nx + vehicle.tz * p.nz, half = vehicle.half || 2.2, width = vehicle.halfWidth || 0.9;
      const axes = [[dx * p.dx + dz * p.dz, dot, 7.5 + Math.abs(dot) * half + Math.abs(cross) * width],
        [dx * p.nx + dz * p.nz, cross, 1.4 + Math.abs(cross) * half + Math.abs(dot) * width]];
      let lo = 0, hi = 80;
      for (const [origin, direction, extent] of axes) {
        if (Math.abs(direction) < 0.0001) { if (Math.abs(origin) > extent) { hi = -1; break; } }
        else {
          const a = (-extent - origin) / direction, b = (extent - origin) / direction;
          lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
        }
      }
      if (lo <= hi) gap = Math.min(gap, lo);
    }
    return gap;
  }
  return { fleet, update, pose, roadGap };
}

/** Tram vehicles and white T signals are independent of ambient road traffic; signal timing is an explicit simulation estimate. */
function createKazanTrams(scene, draw) {
  const trackSystem = createKazanRailways(draw, paths, 'KazanTramTracks');
  const group = new THREE.Group(); group.name = 'KazanTrams'; group.add(trackSystem.group); scene.add(group);
  const red = draw.plainMaterial(0xa32735), cream = draw.plainMaterial(0xe1dfd2), glass = draw.plainMaterial(0x294651, 0.25);
  const metal = draw.plainMaterial(0x747d78, 0.35), dark = draw.plainMaterial(0x303633), white = draw.plainMaterial(0xe9e7d8);
  const blue = draw.plainMaterial(0x3877a3);
  for (const stop of paths.data.stations) {
    const near = paths.nearestRailway(stop.x, stop.z);
    if (!near) continue;
    const p = paths.trackPoint(near.track, near.s), x = p.x + p.nx * 2.8, z = p.z + p.nz * 2.8;
    draw.box(group, x, p.y + 1.6, z, 0.07, 3.2, 0.07, metal);
    draw.box(group, x, p.y + 2.9, z, 0.55, 0.7, 0.08, blue);
    draw.label?.(group, 'Т', x, p.y + 2.9, z + 0.05, 0.42, 0.42, 0, '#ffffff');
  }
  const crossings = paths.data.features.filter((f) => f.kind === 'tram_level_crossing'), signals = [];
  const signalGroups = [false, true].map((horizontal) => {
    const lamps = new THREE.Group(); lamps.name = 'TramSignalProceed';
    const sides = new THREE.Group(); sides.name = 'TramSignalStop';
    group.add(lamps, sides);
    return { horizontal, lamps, sides };
  });
  for (const f of crossings) {
    const near = paths.nearestRailway(f.x, f.z);
    if (!near || near.distance > 4 || near.track.bridge || near.track.tunnel) continue;
    const p = paths.trackPoint(near.track, Math.max(0, near.s - 10)), x = p.x + p.nx * 2.7, z = p.z + p.nz * 2.7;
    draw.box(group, x, p.y + 2.3, z, 0.1, 4.6, 0.1, metal);
    draw.box(group, x, p.y + 4.1, z, 0.65, 0.85, 0.18, dark, -Math.atan2(p.dz, p.dx));
    const crossingPose = paths.trackPoint(near.track, near.s);
    const horizontal = Math.abs(crossingPose.dz) > Math.abs(crossingPose.dx);
    const { lamps, sides } = signalGroups[Number(horizontal)];
    draw.box(group, x + p.dx * 0.13, p.y + 4.3, z + p.dz * 0.13, 0.09, 0.09, 0.09, white);
    for (const u of [-0.2, 0.2]) draw.box(sides, x + p.nx * u + p.dx * 0.13, p.y + 4.3, z + p.nz * u + p.dz * 0.13, 0.09, 0.09, 0.09, white);
    draw.box(lamps, x + p.dx * 0.13, p.y + 4, z + p.dz * 0.13, 0.09, 0.09, 0.09, white);
    signals.push({ feature: f, s: near.s, track: paths.tracks.indexOf(near.track), horizontal });
  }
  for (const { lamps, sides } of signalGroups) { draw.flush(lamps); draw.flush(sides); }
  draw.flush(group);
  function blockedSignal(route, s, time) {
    for (const part of route.parts) {
      if (part.start > s + 80 || part.start + part.length < s) continue;
      for (const item of signals) {
        if (item.track !== part.track) continue;
        const local = (item.s - (part.offset || 0)) / (part.direction || 1);
        if (local < 0 || local > part.length) continue;
        const distance = part.start + local - 18 - s;
        if (distance < -0.1 || distance > 80) continue;
        if (signalPhase(time, item.horizontal) !== 'green') return { distance: Math.max(0, distance) };
      }
    }
    return null;
  }
  const service = createTramService(paths, { vehiclesPerRoute: NYC.runtime?.lite ? 2 : 3, signal: blockedSignal });
  NYC.tramTrafficGap = service.roadGap;
  for (const v of service.fleet) {
    const body = new THREE.Group(); body.name = `Tram/${v.route.ref}`;
    draw.box(body, 0, 1.5, 0, 2.5, 2.55, 14.4, red);
    draw.box(body, 0, 3.03, 0, 2.45, 0.5, 14.3, cream);
    draw.box(body, 0, 2.1, 0, 2.53, 1.15, 13.8, glass);
    for (const z of [-7.18, 7.18]) draw.box(body, 0, 2, z, 2.25, 1.2, 0.08, glass);
    for (const side of [-1, 1]) for (let z = -5.8; z < 7; z += 1.8) draw.box(body, side * 1.28, 2.1, z, 0.09, 1.3, 0.08, cream);
    for (const z of [-4.3, 4.3]) {
      draw.box(body, 0, 0.35, z, 2.15, 0.6, 1.5, dark);
      for (const side of [-1, 1]) draw.box(body, side * 1.24, 0.25, z, 0.15, 0.55, 0.8, dark);
    }
    for (const z of [-5.6, 0.2, 5.4]) {
      draw.box(body, -1.3, 1.5, z, 0.08, 2.2, 1.25, cream);
      draw.box(body, -1.35, 1.85, z, 0.05, 1.15, 1.02, glass);
    }
    for (const z of [-1.2, 1.2]) draw.box(body, 0, 4.25, z, 0.09, 2.3, 0.09, metal);
    draw.box(body, 0, 5.45, 0, 1.6, 0.1, 2.7, metal);
    draw.label?.(body, v.route.ref, 0, 2.95, 7.25, 1.5, 0.42, 0, '#f5e4ab');
    draw.flush(body);
    body.traverse((o) => { if (o.isMesh) { o.matrixWorldAutoUpdate = true; o.castShadow = false; } });
    group.add(body); v.body = body;
  }
  function update(dt, elapsed, camera, roadTraffic, player) {
    const obstacles = [...(roadTraffic?.cars || []), ...(roadTraffic?.buses || [])].filter((v) => v.edge && Number.isFinite(v.x) && Number.isFinite(v.z))
      .filter((v) => service.fleet.some((tram) => (tram.pose.x - v.x) ** 2 + (tram.pose.z - v.z) ** 2 < 90 ** 2))
      .map((v) => ({ x: v.x, z: v.z, y: roadHeight(v.edge.road, v.x, v.z) }));
    if (player) obstacles.push({ x: player.position.x, z: player.position.z, y: player.position.y });
    service.update(dt, elapsed, obstacles);
    trackSystem.update(camera.x, camera.z);
    for (const v of service.fleet) {
      const p = v.pose;
      v.body.visible = Math.hypot(camera.x - p.x, camera.z - p.z) < (runtime?.lite ? 1500 : 4000);
      if (!v.body.visible) continue;
      const back = service.pose(v.route, Math.max(0, v.s - 5)), ahead = service.pose(v.route, Math.min(v.route.length, v.s + 5));
      v.body.position.set(p.x, p.y + 0.32, p.z); v.body.rotation.set(0, Math.atan2(p.dx, p.dz), 0);
      v.body.rotateX(-Math.atan2(ahead.y - back.y, Math.hypot(ahead.x - back.x, ahead.z - back.z) || 1));
    }
    for (const item of signalGroups) {
      item.lamps.visible = signalPhase(elapsed, item.horizontal) === 'green';
      item.sides.visible = !item.lamps.visible;
    }
  }
  return { group, paths, service, update };
}
window.NYC = { ...NYC, TRAM_TRACKS: paths.tracks, tramAt: paths.railwayAt, tramCorridorAt, nearestTram: paths.nearestRailway,
  railwayGroundMeshHeight: trackGroundMeshHeight, createTramService, createKazanTrams };
})();
