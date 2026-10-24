import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { compileBuildingDates } from '../tools/kazan-building-dates.mjs';
import { compileStalinkas } from '../tools/kazan-stalinka.mjs';
import * as THREE from 'three/webgpu';
import polygonClipping from 'polygon-clipping';
import { createKazanStalinkas } from '../js/kazan-stalinka.js';

const catalogue = JSON.parse(readFileSync(new URL('../tools/data/kazan-building-observations.json', import.meta.url))).stalinkaStyles;
const body = (id, properties = {}) => ({ id, osmType: 'way', kind: 'apartments', levels: 5, h: 15, minHeight: 0,
  roofShape: 'flat', roofHeight: 0, material: '', ring: [0, 0, 50, 0, 50, 12, 0, 12], holes: [], ...properties });
const helpers = { cityGeometry: { type: 'Polygon', coordinates: [[[-100, -100], [100, -100], [100, 100], [-100, 100], [-100, -100]]] },
  toWorld: (p) => [p.lon, p.lat], source: { sha256: 'same-source' } };

describe('Citywide Stalinka family', () => {
  test('photographed roof crowns retain their distinct lantern/spire silhouettes and bounded distant/collision envelopes', () => {
    for (const spireHeight of [0, 7]) {
      const group = new THREE.Group(), material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const generator = createKazanStalinkas({ plainMaterial: () => material,
        box(parent, x, y, z, w, h, d, paint, yaw) {
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), paint);
          mesh.position.set(x, y, z); mesh.rotation.y = yaw; parent.add(mesh);
        },
        solid(parent, geometry, paint, x, y, z) {
          const mesh = new THREE.Mesh(geometry, paint); mesh.position.set(x, y, z); parent.add(mesh);
        } });
      const building = body(1, { roofShape: 'hipped', roofHeight: 3, architectureFamily: 'stalinka', facadeFamily: 'stalinka-neoclassical', appearance: catalogue.families.neoclassical,
        stalinkaCrown: { x: 10, z: 6, yaw: 0, width: 7, depth: 7, baseHeight: 15, belvedereHeight: 4, lanternRadius: 1.3, lanternHeight: 3, spireHeight } });
      const saved = structuredClone(building);
      generator.decorate(group, building, 20, 12); group.updateMatrixWorld(true);
      const pedestal = new THREE.Raycaster(new THREE.Vector3(0, 34, 6), new THREE.Vector3(1, 0, 0)).intersectObject(group)[0];
      assert.ok(pedestal, 'a crown above a pitched roof has a supporting pedestal down to the eave');
      const bounds = new THREE.Box3().setFromObject(group);
      assert.ok(bounds.max.y > 42 + spireHeight, 'a supported roof crown must actually extend above the mapped body');
      const top = new THREE.Raycaster(new THREE.Vector3(10, 80, 6), new THREE.Vector3(0, -1, 0)).intersectObject(group)[0];
      assert.ok(top?.point.y > 42 + spireHeight - 0.3, 'the lantern or needle occupies its data-backed rooftop position');
      assert.ok(generator.crownShapes(building).some((s) => s.h + 20 >= bounds.max.y - 0.01), 'the distant silhouette and collision envelope retain the highest point');
      assert.deepEqual(building, saved, 'visual estimates cannot mutate source heights or mapped passage geometry');
      delete building.stalinkaCrown;
      assert.deepEqual(generator.crownShapes(building), [], 'parade classification alone never invents a spire');
    }
  });

  test('cornice surfaces stay below the roof plane on flat roofs and raised mapped parts', () => {
    for (const [variant, base, minHeight, wallHeight] of [['plaster', 12, 0, 15], ['neoclassical', 24, 0, 21], ['neoclassical', 24, 15, 8]]) {
      const group = new THREE.Group(), material = new THREE.MeshBasicMaterial();
      const generator = createKazanStalinkas({ plainMaterial: () => material,
        box(parent, x, y, z, w, h, d, paint, yaw) {
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), paint);
          mesh.position.set(x, y, z); mesh.rotation.y = yaw; parent.add(mesh);
        } });
      const building = body(1, { minHeight, architectureFamily: 'stalinka', facadeFamily: `stalinka-${variant}`, appearance: catalogue.families[variant] });
      generator.decorate(group, building, base, wallHeight);
      const bounds = new THREE.Box3().setFromObject(group);
      assert.ok(!bounds.isEmpty(), 'the projecting trim remains present');
      assert.ok(bounds.max.y <= base + minHeight + wallHeight - 0.08, 'white trim must not share the grey roof/eave plane');
    }
  });

  test('ornament and use are independent; era evidence cannot turn every contemporary building into a parade Stalinka', () => {
    const cases = [
      [{}, {}, 'plaster'],
      [{ material: 'brick', levels: 2, h: 6 }, {}, 'brick'],
      [{ kind: 'dormitory' }, { 'building:architecture': 'stalinist' }, 'neoclassical'],
      [{ ring: [0, 0, 60, 0, 60, 12, 12, 12, 12, 55, 0, 55] }, {}, 'neoclassical'],
      [{}, { 'building:architecture': 'constructivism', start_date: '1937' }, null],
      [{}, { start_date: '1959' }, null],
      [{}, { start_date: 'unknown' }, null],
      [{}, { start_date: '1950', 'building:year': '1980' }, null],
      [{ kind: 'industrial' }, {}, null],
      [{ kind: 'house', levels: 2, h: 6 }, {}, null],
      [{ facadeConfidence: 'reviewed', appearance: { wallColour: '#112233' } }, {}, null],
      [{ facadeCohort: 'observed-project' }, {}, null],
      [{ model: 'kai-dormitory-classical', kind: 'dormitory' }, {}, null],
      [{ material: 'panel' }, {}, null],
      [{}, { 'design:ref': '1-464' }, null],
      [{ facadeFamily: 'school-historic-classroom' }, {}, null]
    ];
    const elements = cases.map(([, tags], i) => ({ type: 'way', id: i + 1, tags: { building: 'apartments', start_date: '1952', ...tags } }));
    const buildings = cases.map(([properties], i) => body(i + 1, properties)), saved = structuredClone(buildings);
    const dates = compileBuildingDates(elements, buildings, helpers), result = compileStalinkas(elements, buildings, dates, catalogue);
    for (let i = 0; i < cases.length; i++) {
      const variant = cases[i][2], binding = result.bindings.find((b) => b.reference === `way/${i + 1}`);
      assert.equal(binding?.variant || null, variant, `classification case ${i + 1}`);
      if (!variant) assert.deepEqual(buildings[i], saved[i], 'a rejected candidate retains its existing facade and geometry');
    }
    assert.equal(result.bindings.find((b) => b.reference === 'way/3').use, 'dormitory');
    assert.equal(buildings[0].appearance.joints, undefined, 'ordinary era houses lose inherited panel joints');
    assert.equal(buildings[0].appearance.balconyZones, undefined, 'no invented continuous apartment balcony strips');
    assert.equal(result.bindings[0].confidence, 'era-morphology-estimate');
  });

  test('an exposed straight avenue front can be parade without promoting the courtyard row or later housing', () => {
    const roads = [{ id: 9, kind: 'secondary', w: 14, pts: [-100, -25, 200, -25] }];
    const buildings = [body(1, { ring: [0, 0, 20, 0, 50, 0, 50, 12, 0, 12] }), body(2, { ring: [0, 35, 50, 35, 50, 47, 0, 47] }), body(3, { ring: [100, 0, 150, 0, 150, 12, 100, 12] })];
    const elements = buildings.map((b) => ({ type: 'way', id: b.id, tags: { start_date: b.id === 3 ? '1970' : '1954', building: 'apartments' } }));
    const dates = compileBuildingDates(elements, buildings, helpers), saved = structuredClone(buildings);
    const result = compileStalinkas(elements, buildings, dates, catalogue, roads);
    assert.equal(buildings[0].facadeFamily, 'stalinka-neoclassical', 'a long straight postwar street facade does not need a corner wing');
    assert.equal(buildings[1].facadeFamily, 'stalinka-plaster', 'an intervening building keeps the courtyard row restrained');
    assert.deepEqual(buildings[2], saved[2], 'proximity to an avenue cannot override a later construction date');
    assert.equal(result.bindings.find((b) => b.reference === 'way/1').frontage.road, 'way/9');
    const crosswise = [body(4)], sources = [{ type: 'way', id: 4, tags: { start_date: '1954' } }];
    compileStalinkas(sources, crosswise, compileBuildingDates(sources, crosswise, helpers), catalogue,
      [{ id: 10, kind: 'primary', w: 14, pts: [-20, -100, -20, 200] }]);
    assert.equal(crosswise[0].facadeFamily, 'stalinka-plaster', 'a short end beside a perpendicular avenue is not a long street frontage');
  });

  test('shared corner composition keeps low wings, raised storeys and clipped passages without changing raw mapped heights', () => {
    const building = body(1, { h: 21, levels: 7, ring: [0,0,60,0,60,14,14,14,14,50,0,50] });
    building.openingVolumes = [{ ring: building.ring, holes: [], minHeight: 5, h: 21 }];
    const source = [{ type: 'way', id: 1, tags: { start_date: '1952' } }], saved = structuredClone(building);
    const styles = { ...catalogue, assignments: { 'way/1': { variant: 'neoclassical', composition: {
      wingHeight: 16, wingLevels: 5, wingRoofHeight: 1, tower: { x: 7, z: 7, yaw: 0, width: 14, depth: 14, height: 21, levels: 7 }
    } } } };
    compileStalinkas(source, [building], compileBuildingDates(source, [building], helpers), styles);
    assert.ok(building.stalinkaSections?.some((s) => s.role === 'raised-tower' && s.h === 21));
    assert.ok(building.stalinkaSections.some((s) => s.role !== 'raised-tower' && s.h === 16));
    for (const key of ['h','levels','ring','holes','openingVolumes']) assert.deepEqual(building[key], saved[key], `raw source ${key} remains intact`);
    function polygon(s) {
      return [s.ring, ...s.holes].map((r) => Array.from({ length: r.length / 2 }, (_, i) => [r[i*2],r[i*2+1]]));
    }
    const sections = building.stalinkaSections;
    assert.deepEqual(polygonClipping.xor(polygon(saved), polygonClipping.union(...sections.map(polygon))), [], 'the vertical composition covers exactly the mapped footprint');
    for (let i = 0; i < sections.length; i++) {
      assert.ok(sections[i].openingVolumes.every((v) => v.h <= sections[i].h), 'the arch masonry is clipped to each wing/tower height');
      for (let j = 0; j < i; j++) assert.deepEqual(polygonClipping.intersection(polygon(sections[i]), polygon(sections[j])), [], 'tower and wings cannot render overlapping body volumes');
    }
    const inferred = body(2, { h: 21, levels: 7, ring: [0,0,60,0,60,14,14,14,14,60,0,60] });
    const sources = [{ type: 'way', id: 2, tags: { start_date: '1952' } }];
    compileStalinkas(sources, [inferred], compileBuildingDates(sources, [inferred], helpers), catalogue,
      [{ id: 10, kind: 'secondary', w: 14, pts: [-100,-20,150,-20] }, { id: 11, kind: 'residential', w: 7, pts: [-20,-100,-20,150] }]);
    assert.ok(inferred.stalinkaSections?.some((s) => s.role === 'raised-tower'), 'two exposed street fronts infer a raised corner without a per-address assignment');
    assert.ok(inferred.stalinkaSections.every((s) => s.h <= 21), 'an inferred corner never exceeds the mapped maximum height');
    assert.equal(inferred.stalinkaCrown, undefined, 'street-corner morphology cannot establish a spire');
    const mapped = body(3, { hasParts: true, body: [{ ring: [12,0,50,0,50,12,12,12], holes: [] }] });
    const tower = body(4, { part: true, parent: 'way/3', h: 21, levels: 7, ring: [0,0,12,0,12,12,0,12] });
    const mappedSource = [{ type: 'way', id: 3, tags: { start_date: '1952' } }, { type: 'way', id: 4, tags: { 'building:part': 'yes' } }];
    const result = compileStalinkas(mappedSource, [mapped, tower], compileBuildingDates(mappedSource, [mapped, tower], helpers), catalogue);
    assert.equal(result.bindings.find((r) => r.reference === 'way/3').compositionEvidence, 'mapped-raised-building-part');
    assert.equal(mapped.facadeFamily, 'stalinka-neoclassical', 'a mapped raised corner identifies the parade family even on a straight footprint');
    assert.ok(mapped.stalinkaSections.some((s) => s.role === 'raised-tower' && s.h === 21), 'mapped upper storeys take precedence without a photographic assignment');
    assert.ok(mapped.stalinkaSections.filter((s) => s.role !== 'raised-tower').every((s) => s.roofShape === 'flat' && s.roofHeight === 0), 'automatic assembly retains a mapped flat wing roof');
  });

  test('owned mapped parts inherit a family without replacing footprints, heights, observed paint or source-backed spires', () => {
    const buildings = [body(1, { roofShape: 'hipped', roofHeight: 3 }),
      body(2, { part: true, parent: 'way/1', h: 25, minHeight: 15, levels: 3 }),
      body(3, { part: true, parent: 'way/1', kind: 'roof', h: 30, minHeight: 25, roofShape: 'pyramidal' }),
      body(4, { part: true, parent: 'way/1' }), body(5, { part: true, parent: 'way/1' }), body(6)];
    const elements = [{ type: 'way', id: 1, tags: { start_date: '1954', 'building:colour': '#aaccbb' } },
      { type: 'way', id: 2, tags: { 'building:colour': '#ccbbaa' } },
      { type: 'way', id: 4, tags: { start_date: '2005' } },
      { type: 'way', id: 5, tags: { 'building:architecture': 'constructivism' } }];
    const saved = structuredClone(buildings), dates = compileBuildingDates(elements, buildings, helpers);
    const result = compileStalinkas(elements, buildings, dates, catalogue);
    assert.equal(buildings[0].appearance.wallColour, '#aaccbb');
    assert.equal(buildings[1].appearance.wallColour, '#ccbbaa');
    assert.equal(buildings[1].facadeFamily, buildings[0].facadeFamily);
    assert.deepEqual(buildings.slice(2), saved.slice(2), 'roof/spire-only parts, later extensions and unowned neighbors are not given apartment facades');
    assert.equal(result.bindings.find((b) => b.reference === 'way/3').role, 'mapped-roof-or-spire');
    assert.equal(result.bindings.some((b) => ['way/4', 'way/5', 'way/6'].includes(b.reference)), false);
    for (let i = 0; i < buildings.length; i++) {
      for (const key of ['ring', 'holes', 'h', 'minHeight', 'levels', 'roofShape', 'roofHeight']) assert.deepEqual(buildings[i][key], saved[i][key], `mapped ${key} is preserved`);
    }
  });
});
