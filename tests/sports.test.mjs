import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { compileSports } from '../tools/kazan-sports.mjs';

const way = (id, ring, tags) => ({ type: 'way', id, tags, geometry: [...ring, ring[0]].map(([lon, lat]) => ({ lon, lat })) });
const rect = (x, z, w, d) => [[x, z], [x + w, z], [x + w, z + d], [x, z + d]];
const body = (e) => ({ id: e.id, osmType: 'way', kind: e.tags.building, ring: e.geometry.slice(0, -1).flatMap((p) => [p.lon, p.lat]), holes: [], part: false });
const helpers = { toWorld: ({ lon, lat }) => [lon, lat], closedRing: (g) => g.slice(0, -1).map((p) => [p.lon, p.lat]),
  joinMembers: (m, role) => m.filter((v) => v.role === role).map((v) => v.geometry),
  cityGeometry: { type: 'Polygon', coordinates: [[[-10, -10], [500, -10], [500, 500], [-10, 500], [-10, -10]]] } };

describe('Sports properties and reusable venue families', () => {
  test('the complete footprint and property holes determine ownership rather than its centre or most vertices', () => {
    const outer = way(1, rect(0, 0, 100, 100), { leisure: 'stadium', sport: 'soccer' });
    const property = { type: 'relation', id: 10, tags: { type: 'multipolygon', leisure: 'stadium', sport: 'soccer' }, members: [
      { type: 'way', ref: 1, role: 'outer', geometry: outer.geometry },
      { type: 'way', ref: 2, role: 'inner', geometry: way(2, rect(40, 40, 20, 20), {}).geometry }] };
    const included = way(20, rect(10, 10, 20, 20), { building: 'grandstand' });
    const spanningHole = way(21, rect(30, 30, 40, 40), { building: 'yes' });
    const crossingEdge = way(22, [[90, 10], [99, 10], [110, 20], [90, 30]], { building: 'yes' });
    const source = [outer, property, included, spanningHole, crossingEdge,
      way(30, rect(5, 65, 30, 20), { leisure: 'pitch', sport: 'soccer;american_football' }),
      way(31, rect(45, 45, 5, 5), { leisure: 'pitch', sport: 'basketball' })];
    const result = compileSports(source, [], helpers, [included, spanningHole, crossingEdge].map(body));
    assert.equal(result.sites.length, 1, 'tagged relation perimeter is an alias, not a second stadium');
    assert.equal(result.sites[0].family, 'open-stadium');
    assert.deepEqual(result.bindings.map((b) => b.reference), ['way/20']);
    assert.equal(result.features.find((f) => f.reference === 'way/31').site, undefined, 'a pitch in the property hole is foreign');
    assert.deepEqual(result.features.find((f) => f.reference === 'way/30').sports, ['soccer', 'american_football']);
  });

  test('a fitness POI in a shared office does not classify the office as an arena or claim an invented property', () => {
    const office = way(1, rect(0, 0, 30, 30), { building: 'office' });
    const source = [office, { type: 'node', id: 2, lon: 10, lat: 10, tags: { leisure: 'fitness_centre', name: 'Fitness' } }];
    const result = compileSports(source, [], helpers, [body(office)]);
    assert.equal(result.sites.length, 1);
    assert.equal(result.sites[0].family, 'fitness');
    assert.equal(result.sites[0].boundarySource, 'unknown');
    assert.deepEqual(result.sites[0].rings, []);
    assert.equal(result.bindings[0].role, 'shared-envelope');
    assert.equal(result.bindings[0].family, 'unknown');
  });

  test('indoor hockey and basketball share a family while campus context and mapped parts remain distinct', () => {
    const hockey = way(1, rect(0, 0, 40, 30), { building: 'sports_hall', leisure: 'sports_centre', sport: 'ice_hockey;ice_skating' });
    const basketball = way(2, rect(100, 0, 40, 30), { building: 'sports_hall', leisure: 'sports_hall', sport: 'basketball;volleyball' });
    const part = { ...body(way(3, rect(100, 0, 20, 30), { building: 'yes' })), part: true, parent: 'way/2' };
    const result = compileSports([hockey, basketball], [], helpers, [body(hockey), body(basketball), part],
      { campuses: [{ rings: [rect(90, -5, 60, 40).flat()], holes: [] }] });
    assert.equal(result.sites.length, 2);
    assert.ok(result.sites.every((s) => s.family === 'indoor-arena'));
    assert.deepEqual(result.sites.find((s) => s.id === 'way/1').sports, ['ice_hockey', 'ice_skating']);
    assert.equal(result.bindings.find((b) => b.reference === 'way/2').context, 'university');
    assert.equal(result.bindings.find((b) => b.reference === 'way/3').parent, 'way/2');
    assert.equal(result.bindings.find((b) => b.reference === 'way/3').family, 'indoor-arena');
    assert.ok(result.sites.every((s) => s.inCity));
  });
});
