import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import polygonClipping from 'polygon-clipping';
import { layoutSchoolYard, compileSchoolYards } from '../tools/kazan-school-yards.mjs';
import { compileEducationalEnclosures } from '../tools/kazan-education-enclosures.mjs';

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

  test('connected fence and gate ways recover a yard with its mapped pitch; an unconnected opening does not invent a parcel', () => {
    const vertices = new Map([[1, [0, 0]], [2, [160, 0]], [3, [160, 140]], [4, [0, 140]], [5, [0, 60]], [6, [0, 58]], [99, [0, 0.1]]]);
    function barrier(id, nodes, kind = 'fence') {
      return { type: 'way', id, nodes, tags: { barrier: kind }, geometry: nodes.map((n) => {
        const [lon, lat] = vertices.get(n); return { lon, lat };
      }) };
    }
    const barriers = [barrier(1, [1, 2, 3]), barrier(2, [3, 4, 5], 'wall'), barrier(3, [5, 6], 'gate'), barrier(4, [6, 1])];
    const helpers = { toWorld: ({ lon, lat }) => [lon, lat] }, enclosures = compileEducationalEnclosures(barriers, helpers);
    assert.equal(enclosures.length, 1);
    assert.deepEqual(enclosures[0].references, ['way/1', 'way/2', 'way/3', 'way/4']);
    const broken = [...barriers.slice(0, -1), barrier(4, [6, 99])];
    assert.equal(compileEducationalEnclosures(broken, helpers).length, 0, 'nearby endpoints do not substitute for actual source topology');
    const body = { id: 10, osmType: 'way', ring: [10, 10, 70, 10, 70, 45, 10, 45], holes: [] };
    const school = { id: 'way/10/school', reference: 'way/10', kind: 'school', rings: [], holes: [], x: 40, z: 25,
      bodies: [{ reference: 'way/10', role: 'teaching' }], features: [], inCity: true, boundarySource: 'unknown' };
    const education = { sites: [school], coverage: { school: { regionalSites: 1 } } };
    const mapped = { reference: 'way/20', kind: 'pitch', sport: 'soccer', closed: true, pts: [80, 50, 145, 50, 145, 85, 80, 85, 80, 50] };
    const result = compileSchoolYards(education, [body], [], [], { enclosures, yardFeatures: [mapped] });
    assert.equal(result.coverage.schoolsWithActivities, 1);
    assert.deepEqual(result.yards[0].boundaryReferences, enclosures[0].references);
    assert.equal(result.yards[0].activities.filter((a) => a.kind === 'football').length, 1);
    assert.equal(result.yards[0].activities.find((a) => a.kind === 'football').geometrySource, 'mapped');
    assert.equal(compileSchoolYards(education, [body], [], [], { enclosures: [] }).coverage.schoolsWithActivities, 0);
  });
});
