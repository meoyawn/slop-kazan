import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { compileEducation } from '../tools/kazan-education.mjs';
import { compileSchoolYards } from '../tools/kazan-school-yards.mjs';

describe('Educational properties and component identity', () => {
  test('school and kindergarten campuses deduplicate POIs and bodies without inventing neighbouring yards', () => {
    function way(id, x, z, w, d, tags) {
      return { type: 'way', id, tags, geometry: [[x, z], [x + w, z], [x + w, z + d], [x, z + d], [x, z]]
        .map(([lon, lat]) => ({ lon, lat })) };
    }
    function node(id, lon, lat, tags) {
      return { type: 'node', id, lon, lat, tags };
    }
    const source = [way(100, 0, 0, 100, 100, { amenity: 'school', name: 'Школа' }), node(101, 20, 20, { amenity: 'school' }),
      way(10, 10, 10, 30, 40, { building: 'school', 'building:material': 'brick' }),
      way(11, 60, 60, 30, 20, { building: 'yes', leisure: 'sports_hall', sport: 'basketball' }),
      way(12, 105, 20, 15, 20, { building: 'yes' }),
      way(200, 150, 0, 60, 80, { amenity: 'kindergarten' }), node(201, 170, 20, { amenity: 'kindergarten' }),
      way(20, 160, 10, 35, 30, { building: 'kindergarten' }),
      way(30, 0, 130, 40, 30, { building: 'school' }), node(301, 10, 140, { amenity: 'school' }),
      node(400, 110, 110, { amenity: 'school' }),
      way(50, 300, 0, 50, 40, { building: 'school', amenity: 'college' }),
      way(111, 45, 15, 45, 30, { leisure: 'pitch', sport: 'soccer' }),
      way(211, 165, 45, 30, 20, { leisure: 'playground' }),
      way(999, 105, 85, 30, 15, { leisure: 'pitch', sport: 'soccer' }),
      node(102, 100, 50, { barrier: 'gate' }), node(302, 40, 145, { entrance: 'main' })];
    const buildings = source.filter((e) => e.tags.building).map((e) => ({ id: e.id, osmType: 'way', kind: e.tags.building,
      part: false, ring: e.geometry.slice(0, -1).flatMap((p) => [p.lon, p.lat]), holes: [], levels: e.id === 20 ? 2 : 3,
      h: 9, heightSource: 'osm-levels', material: e.tags['building:material'] || '',
      ...(e.id === 10 ? { typology: 'school-template', typologyReference: 'way/9999' } : {}) }));
    const result = compileEducation(source, [], { toWorld: ({ lon, lat }) => [lon, lat],
      closedRing: (g) => g.slice(0, -1).map((p) => [p.lon, p.lat]), joinMembers: () => [],
      cityGeometry: { type: 'Polygon', coordinates: [[[-10, -10], [250, -10], [250, 200], [-10, 200], [-10, -10]]] } }, buildings);
    const school = result.sites.find((s) => s.reference === 'way/100'), nursery = result.sites.find((s) => s.kind === 'kindergarten');
    assert.equal(result.coverage.school.regionalSites, 3, 'one bounded school, one unbounded school body and one unattached school POI');
    assert.equal(result.coverage.kindergarten.regionalSites, 1);
    assert.deepEqual(new Set(school.aliases), new Set(['way/100', 'node/101', 'way/10']));
    assert.equal(school.bodies.find((b) => b.reference === 'way/11').role, 'sports-hall');
    assert.ok(school.bodies.some((b) => b.reference === 'way/10'), 'a facade template reference must not replace the mapped body identity');
    assert.equal(school.bodies.find((b) => b.reference === 'way/10').family, 'school-template');
    assert.equal(school.bodies.find((b) => b.reference === 'way/10').templateReference, 'way/9999');
    assert.equal(school.bodies.find((b) => b.reference === 'way/11').evidence, 'procedural-inference');
    assert.ok(!result.bindings.some((b) => b.reference === 'way/12' || b.reference === 'way/50'));
    assert.deepEqual(school.features.map((f) => f.kind).sort(), ['gate', 'pitch']);
    assert.deepEqual(nursery.features.map((f) => f.kind), ['playground']);
    assert.ok(!result.sites.some((s) => s.features.some((f) => f.reference === 'way/999')));
    const unbounded = result.sites.find((s) => s.reference === 'way/30');
    assert.equal(unbounded.boundarySource, 'unknown');
    assert.equal(unbounded.rings.length, 0);
    assert.deepEqual(unbounded.aliases.sort(), ['node/301', 'way/30']);
    assert.equal(unbounded.entrances[0].reference, 'node/302', 'a mapped body entrance remains usable without inventing a property');
    assert.ok(result.sites.every((s) => s.inCity));
  });

  test('a multipolygon and its tagged perimeter count once, while the property hole excludes foreign buildings and play areas', () => {
    const outer = [{ lon: 0, lat: 0 }, { lon: 100, lat: 0 }, { lon: 100, lat: 100 }, { lon: 0, lat: 100 }, { lon: 0, lat: 0 }];
    const hole = [{ lon: 40, lat: 40 }, { lon: 60, lat: 40 }, { lon: 60, lat: 60 }, { lon: 40, lat: 60 }, { lon: 40, lat: 40 }];
    const source = [{ type: 'relation', id: 100, tags: { amenity: 'school', type: 'multipolygon' }, members: [
      { type: 'way', ref: 1, role: 'outer', geometry: outer }, { type: 'way', ref: 2, role: 'inner', geometry: hole }] },
    { type: 'way', id: 1, tags: { amenity: 'school' }, geometry: outer },
    { type: 'node', id: 20, lon: 50, lat: 50, tags: { leisure: 'playground' } }];
    const buildings = [{ id: 10, osmType: 'way', kind: 'yes', ring: [10, 10, 30, 10, 30, 30, 10, 30], holes: [], levels: 2, h: 6 },
      { id: 11, osmType: 'way', kind: 'yes', ring: [45, 45, 55, 45, 55, 55, 45, 55], holes: [], levels: 2, h: 6 }];
    const result = compileEducation(source, [], { toWorld: ({ lon, lat }) => [lon, lat],
      closedRing: (g) => g.slice(0, -1).map((p) => [p.lon, p.lat]),
      joinMembers: (members, role) => members.filter((m) => m.role === role).map((m) => m.geometry) }, buildings);
    assert.equal(result.coverage.school.regionalSites, 1);
    assert.equal(result.sites[0].reference, 'relation/100');
    assert.deepEqual(result.bindings.map((b) => b.reference), ['way/10']);
    assert.equal(result.sites[0].features.length, 0);
    assert.equal(result.sites[0].holes.length, 1);
  });

  test('a preschool group shares a school property without taking its whole yard, while a dedicated childcare parcel stays reserved', () => {
    function way(id, x, z, w, d, tags) {
      return { type: 'way', id, tags, geometry: [[x, z], [x + w, z], [x + w, z + d], [x, z + d], [x, z]]
        .map(([lon, lat]) => ({ lon, lat })) };
    }
    const source = [way(100, 0, 0, 160, 140, { amenity: 'school', name: 'Школа' }),
      way(10, 10, 10, 60, 35, { building: 'school' }),
      { type: 'node', id: 20, lon: 75, lat: 55, tags: { amenity: 'kindergarten', name: 'Дошкольная группа' } },
      way(200, 110, 95, 40, 35, { amenity: 'kindergarten', name: 'Отдельный детский сад' })];
    const buildings = [{ id: 10, osmType: 'way', kind: 'school', ring: [10, 10, 70, 10, 70, 45, 10, 45],
      holes: [], levels: 3, material: '' }];
    const education = compileEducation(source, [], { toWorld: ({ lon, lat }) => [lon, lat],
      closedRing: (g) => g.slice(0, -1).map((p) => [p.lon, p.lat]), joinMembers: () => [] }, buildings);
    const yard = compileSchoolYards(education, buildings, [], [], {}).yards.find((y) => y.schools.includes('way/100/school'));
    assert.ok(yard.activities.length, 'a childcare POI sharing the school property must not reserve the entire school yard');
    for (const activity of yard.activities) {
      const xs = activity.ring.filter((_, i) => !(i % 2)), zs = activity.ring.filter((_, i) => i % 2);
      assert.ok(Math.max(...xs) <= 110 || Math.min(...xs) >= 150 || Math.max(...zs) <= 95 || Math.min(...zs) >= 130,
        'keep the dedicated kindergarten territory clear of school sports');
    }
    const preschool = education.sites.find((s) => s.aliases.includes('node/20'));
    assert.equal(preschool.name, 'Дошкольная группа');
    assert.equal(preschool.sharedProperty, true);
    assert.equal(preschool.boundaryKind, 'school');
  });
});
