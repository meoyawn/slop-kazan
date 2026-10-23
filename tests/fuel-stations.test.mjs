import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { resolveFuelBrand } from '../js/kazan-fuel-brands.js';
import { compileFuelStations } from '../tools/kazan-fuel.mjs';

describe('Citywide filling stations', () => {
  test('mapped branding takes precedence over ownership and accepted fuel cards', () => {
    for (const [tags, family, field] of [
      [{ brand: 'ЛУКОЙЛ', operator: 'Другой оператор' }, 'lukoil', 'brand'],
      [{ brand: 'Teboil', operator: 'ЛУКОЙЛ-Уралнефтепродукт' }, 'teboil', 'brand'],
      [{ brand: 'Местная АЗС', operator: 'ЛУКОЙЛ-Уралнефтепродукт' }, 'neutral', 'brand'],
      [{ operator: 'ООО «ЛУКОЙЛ-Уралнефтепродукт»' }, 'lukoil', 'operator'],
      [{ name: 'IRBIS', 'payment:cards': 'Lukoil' }, 'irbis', 'name'],
      [{ name: 'Газпром', 'payment:cards': 'Lukoil' }, 'neutral', 'name'],
      [{ 'brand:wikidata': 'Q329347' }, 'lukoil', 'brand:wikidata'],
      [{ brand: 'ТАИФ-НК' }, 'taif', 'brand'],
      [{ brand: 'ТАТНЕФТЬ' }, 'tatneft', 'brand']
    ]) {
      const result = resolveFuelBrand(tags);
      assert.equal(result.family, family);
      assert.equal(result.field, field);
    }
  });

  test('containment deduplicates the same site without swallowing adjacent networks or losing mapped pumps', () => {
    const geometry = [[-20, -15], [20, -15], [20, 15], [-20, 15], [-20, -15]].map(([lon, lat]) => ({ lon, lat }));
    const elements = [
      { type: 'way', id: 1, geometry, tags: { amenity: 'fuel', brand: 'Лукойл', ref: '17' } },
      { type: 'node', id: 2, lon: 0, lat: 0, tags: { amenity: 'fuel', brand: 'Лукойл', ref: '17', 'fuel:diesel': 'yes' } },
      { type: 'node', id: 3, lon: 12, lat: 0, tags: { amenity: 'fuel', brand: 'Teboil' } },
      { type: 'node', id: 4, lon: 0, lat: 45, tags: { amenity: 'fuel', brand: 'Лукойл', ref: '18' } },
      { type: 'node', id: 5, lon: -4, lat: 0, tags: { man_made: 'fuel_pump' } }
    ];
    const result = compileFuelStations(elements, {
      toWorld: ({ lon, lat }) => [lon, lat],
      closedRing: (g) => g.slice(0, -1).map(({ lon, lat }) => [lon, lat]),
      insideBounds: ([x, z]) => Math.abs(x) < 1000 && Math.abs(z) < 1000
    }, [
      { id: 10, osmType: 'way', kind: 'roof', ring: [-10, -6, 10, -6, 10, 6, -10, 6], holes: [] },
      { id: 11, osmType: 'way', kind: 'roof', ring: [300, 300, 320, 300, 320, 310, 300, 310], holes: [] }
    ], []);
    assert.equal(result.sourceFeatures, 4);
    assert.equal(result.stations.length, 3);
    const station = result.stations.find((s) => s.id === 'way/1');
    assert.deepEqual(station.references, ['way/1', 'node/2']);
    assert.equal(station.brand.family, 'lukoil');
    assert.ok(station.fuels.includes('diesel'));
    assert.deepEqual(station.pumps.filter((p) => p.source === 'mapped-point').map((p) => [p.x, p.z, p.source]), [[-4, 0, 'mapped-point']]);
    assert.ok(station.pumps.filter((p) => p.source === 'procedural-estimate').every((p) => Math.hypot(p.x + 4, p.z) >= 3));
    assert.deepEqual(result.bindings, [{ id: 'way/10', station: 'way/1', role: 'canopy' }]);
    assert.equal(result.stations.find((s) => s.id === 'node/3').brand.family, 'teboil');
    assert.equal(result.stations.find((s) => s.id === 'node/4').references.length, 1);
  });
});
