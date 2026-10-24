import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { compileWorship } from '../tools/kazan-worship.mjs';

describe('Citywide worship families', () => {
  test('explicit faith and complete property containment preserve denominations, shared envelopes and mapped parts', () => {
    function way(id, x, z, width, depth, tags) {
      const ring = [[x, z], [x + width, z], [x + width, z + depth], [x, z + depth]];
      return { type: 'way', id, tags, geometry: [...ring, ring[0]].map(([lon, lat]) => ({ lon, lat })) };
    }
    const boundary = way(1, 0, 0, 100, 100, { amenity: 'monastery', religion: 'christian', denomination: 'russian_orthodox' });
    const church = way(2, 10, 10, 20, 30, { building: 'church', religion: 'christian', denomination: 'russian_orthodox' });
    const annex = way(3, 40, 10, 20, 20, { building: 'yes' });
    const crossing = way(4, 90, 20, 20, 20, { building: 'yes' });
    const catholic = way(5, 65, 60, 20, 30, { building: 'church', religion: 'christian', denomination: 'roman_catholic' });
    const mosque = way(6, 150, 0, 20, 30, { building: 'mosque', religion: 'muslim' });
    const office = way(7, 10, 60, 20, 20, { building: 'office' });
    const school = way(9, 40, 40, 20, 20, { building: 'school', amenity: 'school', religion: 'christian', denomination: 'russian_orthodox' });
    const source = [boundary, church, annex, crossing, catholic, mosque, office, school];
    const buildings = source.slice(1).map((e) => ({ id: e.id, osmType: 'way', kind: e.tags.building, ring: e.geometry.slice(0, -1).flatMap((p) => [p.lon, p.lat]), holes: [], h: 12 }));
    buildings.push({ id: 8, osmType: 'way', part: true, parent: 'way/6', kind: 'mosque', towerType: 'minaret', h: 24, ring: [151, 1, 153, 1, 153, 3, 151, 3], holes: [] });
    const snapshot = structuredClone(buildings);
    const result = compileWorship(source, { closedRing: (g) => g.slice(0, -1).map((p) => [p.lon, p.lat]) }, buildings);
    assert.equal(result.bindings.find((b) => b.reference === 'way/2').family, 'orthodox');
    assert.equal(result.bindings.find((b) => b.reference === 'way/3').family, 'monastery-wing');
    assert.equal(result.bindings.find((b) => b.reference === 'way/8').role, 'minaret');
    assert.equal(result.bindings.find((b) => b.reference === 'way/8').parent, 'way/6');
    for (const ref of ['way/4', 'way/5', 'way/7', 'way/9']) assert.equal(result.bindings.some((b) => b.reference === ref), false, ref);
    assert.ok(result.gaps.some((g) => g.reference === 'way/7'));
    assert.deepEqual(buildings, snapshot, 'family assignment does not rewrite source dimensions or geometry');
  });
});
