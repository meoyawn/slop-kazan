import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { compileSports } from '../tools/kazan-sports.mjs';
import { readFileSync } from 'node:fs';
import * as THREE from 'three/webgpu';
import { loadModule } from './helpers/module.js';
import { polygonContains } from '../js/footprints.js';

const way = (id, ring, tags) => ({ type: 'way', id, tags, geometry: [...ring, ring[0]].map(([lon, lat]) => ({ lon, lat })) });
const rect = (x, z, w, d) => [[x, z], [x + w, z], [x + w, z + d], [x, z + d]];
const body = (e) => ({ id: e.id, osmType: 'way', kind: e.tags.building, ring: e.geometry.slice(0, -1).flatMap((p) => [p.lon, p.lat]), holes: [], part: false });
const helpers = { toWorld: ({ lon, lat }) => [lon, lat], closedRing: (g) => g.slice(0, -1).map((p) => [p.lon, p.lat]),
  joinMembers: (m, role) => m.filter((v) => v.role === role).map((v) => v.geometry),
  cityGeometry: { type: 'Polygon', coordinates: [[[-10, -10], [500, -10], [500, 500], [-10, 500], [-10, -10]]] } };

describe('Sports properties and reusable venue families', () => {
  test('a mapped ground-level hall entrance stays finite for walking and map arrivals without inventing a stair', () => {
    const building = { id: 1, osmType: 'way', ring: rect(0, 0, 20, 10).flat(), holes: [], h: 24, minHeight: 0, model: 'indoor-arena' };
    const appearance = { family: 'indoor-arena', variant: 'barrel-hall', main: 'way/1', components: ['way/1'],
      entry: { face: 0, width: 6, depth: 1, rise: 0, steps: 0 } };
    const GEO = { buildings: [building], sports: { bindings: [{ reference: 'way/1', appearance }] } }, services = {};
    const config = { toPoints: (ring) => Array.from({ length: ring.length / 2 }, (_, i) => ({ x: ring[i * 2], z: ring[i * 2 + 1] })),
      pointInPoly: polygonContains, groundSurfaceHeight: () => 5, terrainHeight: () => 5 };
    const imports = { 'three/webgpu': THREE, './kazan-runtime.js': { GEO, services }, './kazan-config.js': config };
    const open = loadModule(readFileSync(new URL('../js/kazan-open-stadiums.js', import.meta.url), 'utf8'), { imports });
    loadModule(readFileSync(new URL('../js/kazan-sports.js', import.meta.url), 'utf8'), { imports: { ...imports, './kazan-open-stadiums.js': open } })
      .createKazanSportsModels({ plainMaterial: (color) => new THREE.MeshBasicMaterial({ color }) });
    for (const reference of [undefined, 5.07]) assert.equal(services.sportsSurfaceHeight(10, -0.5, reference, 5), 5);
  });

  test('an open stadium keeps sky and player access over the field even when a source part is a solid cap', () => {
    const main = { id: 1, osmType: 'relation', model: 'open-stadium', h: 40, minHeight: 0, foundationAt: [0, 0], ring: rect(-130, -130, 260, 260).flat(), holes: [] };
    const roof = { id: 2, osmType: 'relation', ring: rect(-100, -100, 200, 200).flat(), holes: [rect(-20, -30, 40, 60).flat()] };
    const podium = { id: 3, osmType: 'relation', h: 3, ring: main.ring, holes: roof.holes };
    const fullCap = { id: 4, osmType: 'way', h: 19, ring: roof.ring, holes: [], parent: 'relation/1', part: true };
    const appearance = { family: 'open-stadium', main: 'relation/1', roof: 'relation/2', podium: 'relation/3', field: 'way/5', roofLow: 24, pitchLength: 40, pitchWidth: 20,
      stairAngles: [0], stairWidth: 10, stairDepth: 6 };
    const GEO = { buildings: [main, roof, podium, fullCap], sports: { bindings: [{ reference: 'relation/1', appearance }],
      features: [{ reference: 'way/5', rings: [rect(-15, -25, 30, 50).flat()], holes: [] }] } };
    function toPoints(r) { return Array.from({ length: r.length / 2 }, (_, i) => ({ x: r[i * 2], z: r[i * 2 + 1] })); }
    function shapeOf(ring, holes = []) {
      const shape = new THREE.Shape(toPoints(ring).map((p) => new THREE.Vector2(p.x, -p.z)));
      for (const hole of holes) shape.holes.push(new THREE.Path(toPoints(hole).map((p) => new THREE.Vector2(p.x, -p.z))));
      return shape;
    }
    const draw = { plainMaterial: (color) => new THREE.MeshBasicMaterial({ color }), shapeOf,
      emit: (group, geometry, material) => group.add(new THREE.Mesh(geometry, material)),
      splitExtrusion: (group, geometry, cap, wall) => group.add(new THREE.Mesh(geometry, [cap, wall])), label() {},
      box(group, x, y, z, w, h, d, material, yaw = 0, orientation) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.position.set(x, y, z);
        if (orientation) mesh.quaternion.copy(orientation); else mesh.rotation.y = yaw;
        group.add(mesh);
      } };
    const owner = loadModule(readFileSync(new URL('../js/kazan-open-stadiums.js', import.meta.url), 'utf8'), { imports: {
      'three/webgpu': THREE, './kazan-runtime.js': { GEO }, './kazan-config.js': { toPoints, pointInPoly: polygonContains, terrainHeight: () => 0 } } });
    const factory = owner.createKazanOpenStadiums(draw);
    const group = new THREE.Group(); assert.equal(factory.emitBuilding(group, main), true); group.updateMatrixWorld(true);
    const hit = new THREE.Raycaster(new THREE.Vector3(3, 60, 4), new THREE.Vector3(0, -1, 0)).intersectObject(group, true)[0];
    assert.ok(hit && hit.point.y >= 0.17 && hit.point.y < 0.25, 'an aerial ray reaches grass and its thin markings through the opening');
    assert.ok(Math.abs(factory.surfaceHeight(3, 4, undefined, 0) - hit.point.y) < 0.03, 'walking height follows the field beneath its thin markings');
    assert.ok(factory.collisionShapes(main).every((v) => !polygonContains(v.ring, 3, 4) || v.holes.some((r) => polygonContains(r, 3, 4))), 'no invisible stadium collider fills the pitch');
    let previous = 0.07;
    for (let step = 0; step < 15; step++) {
      const x = 130 + (15 - step - 0.5) * 6 / 15;
      const tread = new THREE.Raycaster(new THREE.Vector3(x, 10, 0), new THREE.Vector3(0, -1, 0)).intersectObject(group, true)[0];
      const height = factory.surfaceHeight(x, 0, previous, 0);
      assert.ok(tread && Math.abs(height - tread.point.y) < 0.001, 'a walker can climb every actual tread from the preceding one');
      previous = height + 0.07;
    }
    main.h = 20; appearance.roofLow = 18.8; appearance.canopyAngle = Math.PI; appearance.bowlHeight = 13; appearance.stairAngles = [];
    delete appearance.podium;
    const sourceRing = GEO.sports.features[0].rings[0];
    GEO.sports.features[0].rings[0] = Array.from({ length: sourceRing.length / 2 }, (_, i) => sourceRing.slice(i * 2, i * 2 + 2)).reverse().flat();
    const partial = owner.createKazanOpenStadiums(draw), open = new THREE.Group();
    assert.equal(partial.emitBuilding(open, main), true); open.updateMatrixWorld(true);
    const uncovered = new THREE.Raycaster(new THREE.Vector3(0, 60, 70), new THREE.Vector3(0, -1, 0)).intersectObject(open, true)[0];
    const westCanopy = new THREE.Raycaster(new THREE.Vector3(-70, 60, 0), new THREE.Vector3(0, -1, 0)).intersectObject(open, true)[0];
    assert.ok(uncovered && uncovered.point.y < 15, 'the uncovered end sees seating instead of an invented full-ring canopy');
    assert.ok(westCanopy && westCanopy.point.y > 17, 'a western canopy stays west when source ring direction reverses');
    assert.ok(partial.collisionShapes(main).every((v) => 18 < v.minHeight || 18 > v.h || !polygonContains(v.ring, 0, 70) || v.holes.some((r) => polygonContains(r, 0, 70))), 'no invisible overhead volume closes an uncovered stand');
  });

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
