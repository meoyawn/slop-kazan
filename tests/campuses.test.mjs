import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, test } from 'node:test';
import vm from 'node:vm';

describe('Campus circulation', () => {
  test('KFU and KAI internal access cannot become ambient routes while external approaches stay open', () => {
    const data = JSON.parse(gunzipSync(readFileSync(process.env.CAMPUS_TEST_GEODATA || new URL('../js/kazan-geodata.json.gz', import.meta.url))));
    const graph = data.roadGraph;
    const internalKfu = graph.links.filter((l) => data.roads[l[7]].id === 330033093);
    assert.equal(internalKfu.length, 0, 'the access around dvoika and the library is a pedestrian campus, not a through route');
    const kai = graph.links.filter((l) => data.roads[l[7]].id === 186256989);
    assert.ok(kai.length > 0, 'preserve the external Chetaeva approach');
    for (const link of kai) {
      const pts = [graph.nodes[link[0] * 2], graph.nodes[link[0] * 2 + 1], ...link[6], graph.nodes[link[1] * 2], graph.nodes[link[1] * 2 + 1]];
      for (let i = 0; i < pts.length; i += 2) assert.ok(pts[i] <= 1658.2, 'ambient vehicles stop at the actual western campus boundary');
    }
    for (const name of [/Kremlyovskaya/, /Chetaev/]) {
      assert.ok(graph.links.some((l) => name.test(graph.names[l[2]])), `retain the public street ${name}`);
    }
    assert.ok(data.roads.some((r) => r.id === 330033093 && r.pts.length > 8), 'retain the access surface for walking and player movement');
  });

  test('the library hillside has horizontal treads shared with pedestrian foot heights', () => {
    const data = JSON.parse(gunzipSync(readFileSync(new URL('../js/kazan-geodata.json.gz', import.meta.url))));
    const context = vm.createContext({ window: { NYC: { GEO: data } } });
    vm.runInContext(readFileSync(process.env.CAMPUS_TEST_CONFIG || new URL('../js/kazan-config.js', import.meta.url), 'utf8'), context);
    const city = context.window.NYC, road = city.ROADS.find((r) => r.id === 536146887);
    assert.ok(road, 'retain the actual mapped steps beside the library');
    const a = road.pts[0], b = road.pts[1], heights = [];
    for (const t of [0.11, 0.12, 0.6]) {
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const y = city.roadHeight(road, x, z);
      assert.ok(Math.abs(city.surfaceHeight(x, z) - y) < 0.001, 'walking uses the same tread top as the rendered stair');
      heights.push(y);
    }
    assert.ok(Math.abs(heights[0] - heights[1]) < 0.001, 'a tread is horizontal instead of a painted ramp');
    assert.ok(heights[2] - heights[0] > 0.7, 'the staircase still climbs the measured hillside');
  });
});
