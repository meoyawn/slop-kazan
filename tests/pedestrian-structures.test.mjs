import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { compilePedestrianStructures } from '../tools/kazan-pedestrian-structures.mjs';
import { createPedestrianProfiles, pedestrianPathSample } from '../js/kazan-pedestrian-levels.js';

describe('Mapped pedestrian structures', () => {
  test('shared-node stairs join the bridge while a geometric crossing on a separate level stays independent', () => {
    const points = new Map([[1, [-30, 0]], [2, [30, 0]], [3, [45, 0]], [4, [60, 0]], [5, [0, -30]], [6, [0, 30]], [7, [100, 100]], [8, [120, 100]]]);
    function way(id, nodes, tags) {
      return { type: 'way', id, nodes, tags: { highway: 'footway', ...tags }, geometry: nodes.map((id) => ({ lon: points.get(id)[0], lat: points.get(id)[1] })) };
    }
    const result = compilePedestrianStructures([
      way(10, [1, 2], { bridge: 'yes', covered: 'yes' }),
      way(11, [2, 3], {}),
      way(12, [3, 4], { highway: 'steps', incline: 'down', step_count: '30' }),
      way(20, [5, 6], { bridge: 'yes', layer: '2', covered: 'no' }),
      way(30, [7, 8], { bridge: 'boardwalk' }),
      { type: 'node', id: 2, lon: 30, lat: 0, tags: { highway: 'elevator', level: '0;1' } }
    ], {
      toWorld: ({ lon, lat }) => [lon, lat],
      clipRoad: (pts, nodes) => [{ pts, nodes }]
    }, [{ id: 100, name: 'Avenue', layer: 0, w: 18, pts: [0, -50, 0, 50] }]);
    assert.equal(result.structures.length, 3, 'crossing coordinates cannot invent a pedestrian connection');
    const bridge = result.structures.find((s) => s.id === 10);
    assert.deepEqual(bridge.paths.map((p) => [p.id, p.role]), [[10, 'span'], [11, 'landing'], [12, 'stairs']]);
    assert.equal(bridge.paths[2].stepCount, 30);
    assert.equal(bridge.kind, 'road-overpass');
    assert.deepEqual(bridge.crossedRoads.map((r) => r.id), [100]);
    assert.deepEqual(bridge.lifts.map((n) => n.id), [2]);
    assert.equal(result.structures.find((s) => s.id === 20).paths[0].covered, false);
    assert.equal(result.structures.find((s) => s.id === 30).kind, 'boardwalk');
  });

  test('a sidewalk along a motor bridge shares that deck instead of becoming an enclosed crossing', () => {
    const result = compilePedestrianStructures([
      { type: 'way', id: 50, nodes: [1, 2], geometry: [{ lon: -40, lat: 8 }, { lon: 40, lat: 8 }], tags: { highway: 'footway', bridge: 'yes', layer: '1' } }
    ], {
      toWorld: ({ lon, lat }) => [lon, lat],
      clipRoad: (pts, nodes) => [{ pts, nodes }]
    }, [{ id: 100, name: 'Motor bridge', bridge: true, layer: 1, w: 14, pts: [-40, 0, 40, 0] }]);
    assert.equal(result.structures[0].kind, 'road-sidewalk');
    assert.deepEqual(result.structures[0].sharedRoadIndices, [0]);
    assert.equal(result.structures[0].paths[0].covered, false);
  });

  test('the crossing clears lower traffic and its shared stair endpoint descends onto the actual sloping ground', () => {
    const profiles = createPedestrianProfiles([{ id: 1, kind: 'road-overpass', crossedRoads: [{ roadIndex: 0, x: 0, z: 0 }], paths: [
      { id: 10, role: 'span', nodeIds: [1, 2], pts: [-30, 0, 30, 0] },
      { id: 11, role: 'stairs', nodeIds: [2, 3, 4], pts: [30, 0, 45, 0, 60, 0], stepCount: 60 }
    ] }], { groundHeight: (x) => x * 0.02, roads: [], roadSurface: () => 2 });
    const span = profiles[0].paths[0], stair = profiles[0].paths[1];
    assert.ok(pedestrianPathSample(span, 0, 0).y - 0.45 - 2 >= 5.5, 'the slab underside leaves lower vehicles clear');
    assert.equal(span.points.at(-1).y, stair.points[0].y, 'the physical shared node has one deck elevation');
    assert.ok(Math.abs(stair.points.at(-1).y - 1.2) < 1e-9, 'the bottom joins the local ground rather than staying elevated');
    const a = pedestrianPathSample(stair, 33.1, 0), b = pedestrianPathSample(stair, 33.2, 0), next = pedestrianPathSample(stair, 33.8, 0);
    assert.equal(a.y, b.y, 'one rendered tread has a horizontal walking surface');
    assert.ok(next.y < b.y && b.y - next.y <= 0.17, 'descending treads remain ordinary walkable steps');
  });

  test('motor-bridge sidewalks retain the motor deck profile and boardwalks stay close to the ground', () => {
    const path = { id: 1, role: 'span', nodeIds: [1, 2], pts: [-20, 8, 20, 8] };
    const profiles = createPedestrianProfiles([
      { id: 1, kind: 'road-sidewalk', sharedRoadIndices: [0], paths: [path] },
      { id: 2, kind: 'boardwalk', paths: [{ ...path, id: 2 }] }
    ], { groundHeight: () => 1, roads: [{ pts: [{ x: -20, z: 0 }, { x: 20, z: 0 }] }], roadSurface: (index, x) => 12 + x * 0.05 });
    assert.ok(Math.abs(pedestrianPathSample(profiles[0].paths[0], 10, 8).y - 12.5) < 1e-9);
    assert.ok(Math.abs(pedestrianPathSample(profiles[1].paths[0], 10, 8).y - 1.25) < 1e-9);
  });

  test('underground connectivity retains surface stairs and metro identities without excavating ordinary building passages', () => {
    function way(id, nodes, points, tags) {
      return { type: 'way', id, nodes, geometry: points.map(([lon, lat]) => ({ lon, lat })), tags: { highway: 'footway', ...tags } };
    }
    const result = compilePedestrianStructures([
      way(1, [1, 2], [[-10, 0], [10, 0]], { tunnel: 'yes', layer: '-1' }),
      way(2, [3, 1], [[-10, -12], [-10, 0]], { highway: 'steps', incline: 'down' }),
      way(3, [2, 4], [[10, 0], [10, 12]], { highway: 'steps', incline: 'up' }),
      way(4, [3, 5], [[-10, -12], [-10, -30]], {}),
      way(5, [4, 6], [[10, 12], [10, 30]], {}),
      way(6, [7, 8], [[100, 0], [120, 0]], { tunnel: 'building_passage' }),
      way(7, [1, 9, 3], [[-10, 0], [-13, -6], [-10, -12]], { tunnel: 'yes', layer: '-1', incline: 'up' }),
      { type: 'node', id: 1, lon: -10, lat: 0, tags: { railway: 'subway_entrance' } },
      { type: 'node', id: 99, lon: 200, lat: 0, tags: { railway: 'subway_entrance' } }
    ], { toWorld: ({ lon, lat }) => [lon, lat], clipRoad: (pts, nodes) => [{ pts, nodes }], underground: true }, []);
    assert.equal(result.structures.length, 1);
    assert.equal(result.structures[0].kind, 'subway-access');
    assert.deepEqual(result.structures[0].paths.map((p) => p.id).sort((a, b) => a - b), [1, 2, 3, 7]);
    assert.deepEqual(result.structures[0].surfaceNodes.sort(), [3, 4]);
    assert.deepEqual(result.unmatchedEntries.map((e) => e.id), [99]);
    const profiles = createPedestrianProfiles(result.structures, { groundHeight: () => 2, roads: [], roadSurface: () => 2 });
    const paths = profiles[0].paths;
    const tunnel = paths.find((p) => p.id === 1), down = paths.find((p) => p.id === 2), up = paths.find((p) => p.id === 3), ramp = paths.find((p) => p.id === 7);
    assert.ok(tunnel.points.every((p) => p.y < -1.5), 'the connecting passage stays below the street');
    assert.equal(down.points[0].y, 2);
    assert.equal(up.points.at(-1).y, 2);
    assert.equal(down.points.at(-1).y, tunnel.points[0].y);
    assert.equal(ramp.role, 'ramp', 'a covered inclined access path must not become a level connecting tunnel');
    assert.ok(ramp.points[1].y > ramp.points[0].y && ramp.points[1].y < 2, 'the switchback climbs continuously to the surface');
  });
});
