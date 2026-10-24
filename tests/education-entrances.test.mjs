import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import polygonClipping from 'polygon-clipping';
import { compileEducationEntrances } from '../tools/kazan-education-entrances.mjs';
import { compileEducation } from '../tools/kazan-education.mjs';

describe('Mapped educational entrances', () => {
  test('owned outer and courtyard walls determine the door pose, while porches stay clear of the actual property and neighbouring bodies', () => {
    const buildings = [{ id: 10, osmType: 'way', kind: 'school', h: 9, minHeight: 0,
      ring: [10, 10, 90, 10, 90, 90, 10, 90], holes: [[30, 30, 70, 30, 70, 70, 30, 70]] },
    { id: 10, osmType: 'way', kind: 'school', h: 6, minHeight: 0, ring: [110, 10, 140, 10, 140, 40, 110, 40], holes: [] },
    { id: 20, osmType: 'way', kind: 'yes', h: 6, minHeight: 0, ring: [91, 47, 120, 47, 120, 53, 91, 53], holes: [] }];
    const entrances = [{ reference: 'node/1', pts: [90, 50], entranceType: 'main' },
      { reference: 'node/2', pts: [30, 50], entranceType: 'service' },
      { reference: 'node/3', pts: [10, 50], entranceType: 'main' }];
    const site = { id: 'property/school', kind: 'school', inCity: true, rings: [[0, 0, 90.4, 0, 90.4, 100, 0, 100]], holes: [],
      bodies: [{ reference: 'way/10' }], entrances };
    const education = { sites: [site], bindings: [{ site: site.id, reference: 'way/10' }] };
    const result = compileEducationEntrances(education, buildings);
    assert.equal(result.entries.length, 3);
    const east = result.entries.find((e) => e.id === 'node/1'), courtyard = result.entries.find((e) => e.id === 'node/2');
    assert.equal(east.buildingIndex, 0, 'multiple outer polygons sharing an OSM identity cannot redirect a mapped door to the last fragment');
    assert.ok(east.nx > 0.99 && Math.abs(east.nz) < 0.01);
    assert.ok(courtyard.nx > 0.99 && Math.abs(courtyard.nz) < 0.01, 'the courtyard door faces the hole rather than the occupied building');
    assert.ok(courtyard.width < east.width, 'mapped service doors use the small shared variant');
    assert.ok(east.approach, 'the narrow remaining strip still fits the shallow porch variant');
    for (const entry of result.entries) {
      const points = Array.from({ length: entry.approach.length / 2 }, (_, i) => entry.approach.slice(i * 2, i * 2 + 2));
      assert.equal(polygonClipping.difference([points], [[[0, 0], [90.4, 0], [90.4, 100], [0, 100]]]).length, 0);
      for (const body of buildings) {
        const outer = Array.from({ length: body.ring.length / 2 }, (_, i) => body.ring.slice(i * 2, i * 2 + 2));
        const holes = body.holes.map((r) => Array.from({ length: r.length / 2 }, (_, i) => r.slice(i * 2, i * 2 + 2)));
        assert.equal(polygonClipping.intersection([points], [outer, ...holes]).length, 0, 'no approach is placed through a neighbouring wall');
      }
    }
    assert.deepEqual(compileEducationEntrances(structuredClone(education), structuredClone(buildings)), result);
  });

  test('shared envelopes get only their actual door, while gates, upper floors and distant points remain explicit', () => {
    const buildings = [{ id: 1, osmType: 'way', kind: 'office', h: 12, minHeight: 0, ring: [0, 0, 20, 0, 20, 20, 0, 20], holes: [] }];
    const site = { id: 'shared/school', kind: 'school', bodies: [{ reference: 'way/1' }], rings: [], holes: [], entrances: [
      { reference: 'node/1', pts: [20, 10], entranceType: 'yes' },
      { reference: 'node/2', pts: [10, 20], entranceType: 'main', barrier: 'gate' },
      { reference: 'node/3', pts: [0, 10], level: '1' },
      { reference: 'node/4', pts: [40, 40] }] };
    const result = compileEducationEntrances({ sites: [site], bindings: [] }, buildings);
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].approach, undefined);
    assert.equal(result.entries[0].canopy, false);
    assert.equal(result.entries[0].sharedEnvelope, true);
    assert.equal(result.gates[0].id, 'node/2');
    assert.deepEqual(result.unresolved.map((e) => e.reason), ['non-ground-level', 'no-nearby-owned-wall']);
    assert.equal(site.rings.length, 0, 'a known door does not invent a school territory');
  });

  test('mapped freestanding school roofs keep their footprint and top while allowing access underneath', () => {
    const buildings = [{ id: 1, osmType: 'way', kind: 'roof', h: 3, minHeight: 0, ring: [0, 0, 8, 0, 8, 4, 0, 4], holes: [] },
      { id: 2, osmType: 'way', kind: 'roof', h: 4, minHeight: 2.5, ring: [10, 0, 18, 0, 18, 4, 10, 4], holes: [] },
      { id: 3, osmType: 'way', kind: 'roof', h: 3, minHeight: 0, ring: [30, 0, 38, 0, 38, 4, 30, 4], holes: [] }];
    const site = { id: 'school', kind: 'school', bodies: [{ reference: 'way/1' }, { reference: 'way/2' }], entrances: [] };
    const result = compileEducationEntrances({ sites: [site], bindings: [] }, buildings);
    assert.ok(buildings[0].minHeight > 2.5, 'a roof must not become a solid room blocking the mapped approach');
    assert.equal(buildings[0].h, 3);
    assert.deepEqual(buildings[0].ring, [0, 0, 8, 0, 8, 4, 0, 4]);
    assert.equal(buildings[1].minHeight, 2.5, 'retain a mapped underside');
    assert.equal(buildings[2].minHeight, 0, 'unrelated source buildings remain unchanged');
    assert.equal(result.canopies.length, 2);
  });

  test('an entrance node on a mapped fence becomes a site opening rather than a distant invented building door', () => {
    const geometry = [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]].map(([lon, lat]) => ({ lon, lat }));
    const source = [{ type: 'way', id: 100, tags: { amenity: 'school', barrier: 'fence' }, nodes: [1, 2, 3, 4, 1], geometry },
      { type: 'node', id: 2, lon: 20, lat: 0, tags: { entrance: 'yes' } }];
    const buildings = [{ id: 10, osmType: 'way', kind: 'school', h: 9, minHeight: 0, ring: [5, 5, 15, 5, 15, 15, 5, 15], holes: [], material: '' }];
    const education = compileEducation(source, [], { toWorld: ({ lon, lat }) => [lon, lat],
      closedRing: (g) => g.slice(0, -1).map((p) => [p.lon, p.lat]), joinMembers: () => [] }, buildings);
    const result = compileEducationEntrances(education, buildings);
    assert.equal(result.unresolved.length, 0, 'source fence membership resolves the site entrance without inventing a door in a building');
    assert.equal(result.entries.length, 0);
    assert.equal(result.gates[0].id, 'node/2');
    assert.deepEqual(result.gates[0].boundaryReferences, ['way/100']);
  });
});
