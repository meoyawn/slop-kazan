import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { compilePedestrianStructures } from '../tools/kazan-pedestrian-structures.mjs';

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
});
