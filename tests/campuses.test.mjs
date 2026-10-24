import { runCityModule } from './helpers/module.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, test } from 'node:test';
import vm from 'node:vm';

describe('Campus circulation', () => {
  test('mapped educational grounds cannot become ambient routes while external approaches stay open', () => {
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
    // Query the actual emitted routes independently of campusAccess flags and the compiler's splitter.
    const inside = (ring, x, z) => {
      let result = false;
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const dx = ring[i] - ring[j], dz = ring[i + 1] - ring[j + 1];
        const t = Math.max(0, Math.min(1, ((x - ring[j]) * dx + (z - ring[j + 1]) * dz) / (dx * dx + dz * dz || 1)));
        // The compiled 0.1 m coordinates leave a small uncertainty band along mapped fences.
        if (Math.hypot(x - ring[j] - t * dx, z - ring[j + 1] - t * dz) < 0.15) return false;
        if ((ring[i + 1] > z) !== (ring[j + 1] > z) && x < (ring[j] - ring[i]) * (z - ring[i + 1]) / (ring[j + 1] - ring[i + 1]) + ring[i]) result = !result;
      }
      return result;
    };
    const properties = [...data.campuses, ...(data.education?.sites || []).filter((s) => s.rings.length),
      ...(data.education?.schoolYards?.yards || [])];
    const campuses = properties.map((c) => ({ ...c,
      minX: Math.min(...c.rings.flatMap((r) => r.filter((_, i) => i % 2 === 0))),
      maxX: Math.max(...c.rings.flatMap((r) => r.filter((_, i) => i % 2 === 0))),
      minZ: Math.min(...c.rings.flatMap((r) => r.filter((_, i) => i % 2 === 1))),
      maxZ: Math.max(...c.rings.flatMap((r) => r.filter((_, i) => i % 2 === 1)))
    }));
    for (const link of graph.links) {
      const road = data.roads[link[7]];
      if (road.bridge || road.tunnel || road.layer) continue;
      const pts = [graph.nodes[link[0] * 2], graph.nodes[link[0] * 2 + 1], ...link[6], graph.nodes[link[1] * 2], graph.nodes[link[1] * 2 + 1]];
      for (let i = 2; i < pts.length; i += 2) {
        const x = pts[i - 2], z = pts[i - 1], dx = pts[i] - x, dz = pts[i + 1] - z, length = Math.hypot(dx, dz);
        const candidates = campuses.filter((c) => Math.max(x, pts[i]) > c.minX && Math.min(x, pts[i]) < c.maxX && Math.max(z, pts[i + 1]) > c.minZ && Math.min(z, pts[i + 1]) < c.maxZ);
        for (let distance = 1; distance < length - 1; distance += 2) {
          const px = x + dx * distance / length, pz = z + dz * distance / length;
          const campus = candidates.find((c) => c.rings.some((r) => inside(r, px, pz)) && !c.holes.some((r) => inside(r, px, pz)));
          assert.ok(!campus, `road ${road.id} admits ambient traffic inside campus ${campus?.id} at ${px},${pz}`);
        }
      }
    }
    for (const id of [122361537, 180373540]) {
      assert.ok(graph.links.some((l) => data.roads[l[7]].id === id), `${id}: keep the public approach outside KGASU`);
      assert.ok(data.roads.some((r) => r.id === id && !r.walk), `${id}: retain the mapped surface and player access`);
    }
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
