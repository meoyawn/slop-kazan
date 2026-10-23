import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, test } from 'node:test';

describe('Residential courtyard traffic', () => {
  test('Vagapova yards cannot become through routes while the public residential street stays connected', () => {
    const data = JSON.parse(gunzipSync(readFileSync(process.env.COURTYARD_TEST_GEODATA || new URL('../js/kazan-geodata.json.gz', import.meta.url))));
    const graph = data.roadGraph;
    assert.equal(graph.links.filter((l) => data.roads[l[7]].id === 104016169).length, 0, 'the marked living-street yard cannot carry ambient through traffic');
    for (const id of [104016169, 104016170]) {
      const surfaces = data.roads.filter((r) => r.id === id);
      assert.ok(surfaces.some((r) => r.pts.length >= 4 && !r.walk), 'keep the asphalt and player vehicle access');
    }
    const approaches = graph.links.filter((l) => data.roads[l[7]].id === 104016170);
    assert.ok(approaches.length > 0, 'keep the unmarked way’s short approaches outside the residential boundary');
    let approachLength = 0;
    for (const link of approaches) {
      const pts = [graph.nodes[link[0] * 2], graph.nodes[link[0] * 2 + 1], ...link[6], graph.nodes[link[1] * 2], graph.nodes[link[1] * 2 + 1]];
      for (let i = 2; i < pts.length; i += 2) approachLength += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    }
    assert.ok(approachLength < 25, `only the roughly 17 m of external approaches should remain, not ${approachLength.toFixed(1)} m through the yard`);
    for (const id of [137007899, 137008758]) {
      assert.ok(graph.links.some((l) => data.roads[l[7]].id === id), `${id}: retain the actual Vagapova street`);
    }
    assert.equal(graph.links.filter((l) => data.roads[l[7]].courtyard).length, 0, 'the same exclusion applies to every classified courtyard in the city');
  });
});
