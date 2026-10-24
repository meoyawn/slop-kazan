import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { compileBuildingDates } from '../tools/kazan-building-dates.mjs';
import { compileStalinkas } from '../tools/kazan-stalinka.mjs';

const catalogue = JSON.parse(readFileSync(new URL('../tools/data/kazan-building-observations.json', import.meta.url))).stalinkaStyles;
const body = (id, properties = {}) => ({ id, osmType: 'way', kind: 'apartments', levels: 5, h: 15, minHeight: 0,
  roofShape: 'flat', roofHeight: 0, material: '', ring: [0, 0, 50, 0, 50, 12, 0, 12], holes: [], ...properties });
const helpers = { cityGeometry: { type: 'Polygon', coordinates: [[[-100, -100], [100, -100], [100, 100], [-100, 100], [-100, -100]]] },
  toWorld: (p) => [p.lon, p.lat], source: { sha256: 'same-source' } };

describe('Citywide Stalinka family', () => {
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
