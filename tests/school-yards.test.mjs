import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import polygonClipping from 'polygon-clipping';
import { layoutSchoolYard } from '../tools/kazan-school-yards.mjs';

const pointsOf = (ring) => Array.from({ length: ring.length / 2 }, (_, i) => ring.slice(i * 2, i * 2 + 2));

function polygonArea(polygons) {
  let total = 0;
  for (const polygon of polygons) for (const [index, ring] of polygon.entries()) {
    let value = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i++) value += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    total += Math.abs(value) / 2 * (index ? -1 : 1);
  }
  return total;
}

describe('Geometry-driven school yards', () => {
  test('fixed territory and buildings produce fixed non-overlapping activities while preserving holes and entrance circulation', () => {
    const input = { rings: [[0, 0, 160, 0, 160, 140, 0, 140]], holes: [[70, 90, 90, 90, 90, 110, 70, 110]],
      buildings: [{ ring: [10, 10, 80, 10, 80, 45, 60, 45, 60, 25, 30, 25, 30, 45, 10, 45], holes: [] }],
      paths: [{ pts: [45, 0, 45, 10], width: 3 }],
      mapped: [{ kind: 'football', ring: [100, 60, 150, 60, 150, 90, 100, 90] }],
      reserved: [{ ring: [95, 95, 140, 95, 140, 130, 95, 130] }] };
    const first = layoutSchoolYard(input), repeated = layoutSchoolYard(structuredClone(input));
    assert.deepEqual(repeated, first);
    assert.ok(first.activities.some((a) => a.kind === 'exercise'));
    assert.ok(first.activities.some((a) => a.kind === 'hockey'));
    assert.ok(!first.activities.some((a) => a.kind === 'football'), 'retain the existing mapped football field');
    const property = [pointsOf(input.rings[0]), pointsOf(input.holes[0])];
    const obstacles = [...input.buildings.map((b) => [pointsOf(b.ring)]), ...input.mapped.map((m) => [pointsOf(m.ring)]), ...input.reserved.map((m) => [pointsOf(m.ring)]),
      [pointsOf([42.3, 0, 47.7, 0, 47.7, 10, 42.3, 10])]];
    for (const [index, item] of first.activities.entries()) {
      const polygon = [pointsOf(item.ring)];
      assert.ok(polygonArea(polygonClipping.difference(polygon, property)) < 0.01, 'every activity stays in the actual property and outside its hole');
      for (const obstacle of obstacles) assert.ok(polygonArea(polygonClipping.intersection(polygon, obstacle)) < 0.01);
      for (const other of first.activities.slice(index + 1)) assert.ok(polygonArea(polygonClipping.intersection(polygon, [pointsOf(other.ring)])) < 0.01);
    }
    const moved = structuredClone(input);
    moved.buildings[0].ring = moved.buildings[0].ring.map((value, i) => i % 2 ? value + 35 : value);
    assert.notDeepEqual(layoutSchoolYard(moved).activities, first.activities, 'a changed school position changes the available configuration');
  });

  test('a compact yard receives fitting exercise equipment instead of an oversized field, and unknown territory is not invented', () => {
    const result = layoutSchoolYard({ rings: [[0, 0, 30, 0, 30, 40, 0, 40]],
      buildings: [{ ring: [4, 4, 26, 4, 26, 24, 4, 24], holes: [] }] });
    assert.deepEqual(result.activities.map((a) => a.kind), ['exercise']);
    assert.deepEqual(layoutSchoolYard({ rings: [] }), { activities: [], status: 'missing-property' });
  });
});
