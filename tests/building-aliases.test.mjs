import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolveBuildingAliases } from '../tools/kazan-building-aliases.mjs';

describe('Reviewed duplicate building identities', () => {
  test('only an explicitly reviewed alias loses its physical volume, while the original outline remains available', () => {
    const old = { id: 1, osmType: 'way', ring: [0,0,12,0,12,40,0,40], levels: 5, h: 15 };
    const current = { id: 2, osmType: 'way', ring: [1,0,13,0,13,40,1,40], levels: 5, h: 15 };
    const independent = { id: 3, osmType: 'way', ring: [0,0,12,0,12,40,0,40], levels: 5, h: 15 };
    const unreviewed = [old, current, independent];
    assert.deepEqual(resolveBuildingAliases(unreviewed, {}), []);
    assert.deepEqual(unreviewed, [old, current, independent], 'overlap alone cannot delete a building');
    const buildings = [old, current, independent];
    const aliases = resolveBuildingAliases(buildings, { 'way/1': { duplicateOf: 'way/2', source: 'photographic-review' } });
    assert.deepEqual(buildings, [current, independent]);
    assert.equal(aliases.length, 1);
    assert.equal(aliases[0].canonical, 'way/2');
    assert.deepEqual(aliases[0].building, old, 'retain the source geometry, height and storeys');
  });

  test('invalid or chained aliases fail before changing the physical inventory', () => {
    for (const observations of [
      { 'way/1': { duplicateOf: 'way/9' } },
      { 'way/1': { duplicateOf: 'way/1' } },
      { 'way/1': { duplicateOf: 'way/2' }, 'way/2': { duplicateOf: 'way/1' } }
    ]) {
      const buildings = [{ id: 1, osmType: 'way' }, { id: 2, osmType: 'way' }];
      const before = buildings.slice();
      assert.throws(() => resolveBuildingAliases(buildings, observations), /Invalid building alias/);
      assert.deepEqual(buildings, before);
    }
  });
  test('the compiled Korolenko scene has one physical dormitory and retains its reviewed source alias', () => {
    const data=JSON.parse(gunzipSync(readFileSync(process.env.BUILDING_ALIAS_GEODATA || new URL('../js/kazan-geodata.json.gz',import.meta.url))));
    const bodies=data.buildings.filter(b=>b.osmType==='way'&&[71169908,1370718376].includes(b.id));
    assert.equal(bodies.length,1,'the overlapping source outlines must not render two buildings');
    assert.equal(bodies[0].id,1370718376);
    const alias=data.buildingAliases.find(a=>a.reference==='way/71169908');
    assert.equal(alias.canonical,'way/1370718376');
    assert.equal(alias.building.levels,5);
    assert.equal(alias.building.h,15);
  });

});
