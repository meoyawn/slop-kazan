import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, test } from 'node:test';
import { createBuildingTypologies, matchBuildingTypology } from '../tools/kazan-building-typologies.mjs';

describe('Repeated school plans', () => {
  test('the photographed sibling school matches Gymnasium 155 despite its orientation; historic and two-storey schools do not', () => {
    const data = JSON.parse(gunzipSync(readFileSync(new URL('../js/kazan-geodata.json.gz', import.meta.url))));
    const reference = data.buildings.find((b) => b.id === 83289956);
    const sibling = data.buildings.find((b) => b.id === 91866730);
    const historic = data.buildings.find((b) => b.id === 90155396);
    const templates = createBuildingTypologies([{ id: 'school-panel-155', reference: 'way/83289956', facadeProfile: 'school-panel-classroom',
      sizeTolerance: 0.15, minSimilarity: 0.85 }],
    [{ type: 'way', id: reference.id, geometry: Array.from({ length: reference.ring.length / 2 }, (_, i) => [reference.ring[i * 2], reference.ring[i * 2 + 1]]) }], (p) => p);
    const ring = Array.from({ length: sibling.ring.length / 2 }, (_, i) => [sibling.ring[i * 2], sibling.ring[i * 2 + 1]]);
    const match = matchBuildingTypology({ building: 'school', 'building:levels': '4' }, ring, templates);
    assert.equal(match.id, 'school-panel-155');
    assert.ok(match.score > 0.9);
    assert.equal(matchBuildingTypology({ building: 'school', 'building:levels': '2' }, ring, templates), null);
    assert.equal(matchBuildingTypology({ building: 'school', 'building:levels': '4' },
      Array.from({ length: historic.ring.length / 2 }, (_, i) => [historic.ring[i * 2], historic.ring[i * 2 + 1]]), templates), null);
    assert.notEqual(sibling.appearance.plinthColour, reference.appearance.plinthColour, 'reuse the panel construction without copying the school-specific paint');
  });
});
