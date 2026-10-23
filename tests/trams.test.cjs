const { runCityModule } = require('./helpers/module.cjs');
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadTrams() {
    const city = { GEO: {}, groundSurfaceHeight: () => 0, terrainHeight: () => 0, nearestRoads: () => [],
      toPoints: (p) => Array.from({ length: p.length / 2 }, (_, i) => ({ x: p[i * 2], z: p[i * 2 + 1] })) };
    const context = vm.createContext({ NYC: city, window: {} });
    for (const file of ['kazan-railways.js', 'kazan-trams.js']) {
      runCityModule(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context);
      context.NYC = context.window.NYC;
    }
    return context.window.NYC;
}

describe('Tram service', () => {
  test('a vehicle dwells at a stop, obeys a red restriction and yields without jumping to its terminus', () => {
    const api = loadTrams();
    const track = { id: 1, kind: 'tram', pts: [0, 0, 1000, 0], nodes: [0, 1], tracks: 1, layer: 0, maxspeed: '36', access: 'yes' };
    const data = { tracks: [track], graph: { nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 1000, z: 0 }], links: [{ a: 0, b: 1, track: 0, length: 1000 }] },
      routes: [{ id: 7, ref: '7', length: 1000, parts: [{ track: 0, start: 0, length: 1000 }], stops: [{ s: 200 }], gaps: [], missingWays: [] }] };
    let red = true;
    const service = api.createTramService(api.createRailwayPaths(data), { vehiclesPerRoute: 1,
      signal: (route, s) => red && s <= 350 ? { distance: 350 - s } : null });
    const vehicle = service.fleet[0];
    const approach = { x: 100, y: 0, z: 0, tx: 1, tz: 0, half: 2.2, halfWidth: 0.9 };
    assert.ok(service.roadGap(approach) > 19 && service.roadGap(approach) < 21, 'road vehicles keep clear of the tram body');
    assert.equal(service.roadGap({ ...approach, y: 8 }), Infinity, 'traffic on another level remains clear');
    assert.equal(service.roadGap({ ...approach, z: 5 }), Infinity, 'the neighbouring lane remains clear');
    let elapsed = 0;
    for (; elapsed < 100 && vehicle.state !== 'dwell'; elapsed += 0.1) service.update(0.1, elapsed);
    assert.equal(vehicle.state, 'dwell'); assert.equal(vehicle.s, 200); assert.equal(vehicle.speed, 0);
    for (let i = 0; i < 100; i++) service.update(0.1, elapsed += 0.1);
    assert.equal(vehicle.s, 200, 'remain at the platform during dwell');
    for (let i = 0; i < 1000; i++) service.update(0.1, elapsed += 0.1);
    assert.ok(vehicle.s <= 350 && vehicle.s > 349, 'stop at the signal restriction');
    assert.equal(vehicle.finished, false);
    red = false;
    for (let i = 0; i < 400; i++) service.update(0.1, elapsed += 0.1, [{ x: 500, z: 0, y: 0 }]);
    assert.ok(vehicle.s <= 488 && vehicle.s > 480, 'leave clearance to an obstacle in the track corridor');
    for (let i = 0; i < 1200; i++) service.update(0.1, elapsed += 0.1);
    assert.equal(vehicle.s, 1000); assert.equal(vehicle.finished, true); assert.equal(vehicle.speed, 0);
  });

  test('a terminal return traverses mapped one-way turnback tracks without a position jump', () => {
    const api = loadTrams(), coordinates = [[0, 0], [100, 0], [100, 30], [0, 30]];
    const nodes = coordinates.map(([x, z], id) => ({ id, x, z }));
    const tracks = coordinates.map(([x, z], i) => ({ id: i, kind: 'tram', pts: [x, z, ...coordinates[(i + 1) % 4]],
      nodes: [i, (i + 1) % 4], tracks: 1, layer: 0, direction: 1, access: 'yes' }));
    const links = tracks.map((t, i) => ({ a: i, b: (i + 1) % 4, track: i, direction: 1,
      length: Math.hypot(t.pts[2] - t.pts[0], t.pts[3] - t.pts[1]) }));
    const routes = [0, 2].map((track) => ({ id: track, ref: '6', length: 100, parts: [{ track, start: 0, length: 100 }],
      stops: [], gaps: [], missingWays: [] }));
    const service = api.createTramService(api.createRailwayPaths({ tracks, graph: { nodes, links }, routes }), { vehiclesPerRoute: 1 });
    const vehicle = service.fleet[0]; let previous = vehicle.pose, usedTurnback = false, reachedOpposite = false;
    for (let i = 0; i < 1600; i++) {
      service.update(0.1, i / 10);
      assert.ok(Math.hypot(vehicle.pose.x - previous.x, vehicle.pose.z - previous.z) < 1.5, 'move continuously through the turnback');
      if (vehicle.pose.z > 1 && vehicle.pose.z < 29) usedTurnback = true;
      if (vehicle.route.id === 2) reachedOpposite = true;
      previous = vehicle.pose;
    }
    assert.ok(usedTurnback && reachedOpposite);
    assert.equal(vehicle.finished, false);
  });
});
