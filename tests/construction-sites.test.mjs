import { runCityModule } from './helpers/module.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import vm from 'node:vm';
import { describe, test } from 'node:test';

const data = JSON.parse(gunzipSync(readFileSync(process.env.CONSTRUCTION_TEST_GEODATA || new URL('../js/kazan-geodata.json.gz', import.meta.url))));

describe('Current construction state', () => {
  test('the two planned beach towers are piling sites, while the existing Riviera hotel keeps its height', () => {
    const towers = data.buildings.filter((b) => b.osmType === 'relation' && b.id === 20028892);
    assert.equal(towers.length, 2, 'identify both mapped future tower footprints');
    for (const b of towers) {
      assert.equal(b.construction?.stage, 'piling');
      assert.equal(b.construction.plannedLevels, 25);
      assert.equal(b.construction.plannedHeight, 75);
      assert.ok(b.h < 1, 'a future envelope must not become a completed tower or a tall collider');
    }
    const riviera = data.buildings.find((b) => b.id === 83289881);
    assert.equal(riviera.h, 85);
    assert.equal(riviera.construction, undefined);
    const market = data.buildings.find((b) => b.id === 95046265);
    assert.equal(market.construction?.stage, 'renovation');
    assert.equal(market.h, 3, 'retain the existing market shell during renovation');
    const unreviewed = data.buildings.find((b) => b.kind === 'construction' && b.id !== 20028892);
    assert.equal(unreviewed.construction?.stage, 'unknown');
    assert.ok(unreviewed.h < 1, 'an unknown stage must not render planned floors as completed');
  });

  test('excavations lower the rendered terrain and the player surface beneath both beach footprints', () => {
    const context = vm.createContext({ window: { NYC: { GEO: data } } });
    runCityModule(readFileSync(new URL('../js/kazan-config.js', import.meta.url), 'utf8'), context);
    const city = context.window.NYC;
    for (const b of data.buildings.filter((b) => b.osmType === 'relation' && b.id === 20028892)) {
      const xs = b.ring.filter((v, i) => i % 2 === 0), zs = b.ring.filter((v, i) => i % 2 === 1);
      const x = (Math.min(...xs) + Math.max(...xs)) / 2, z = (Math.min(...zs) + Math.max(...zs)) / 2;
      assert.ok(city.terrainHeight(x, z) - city.groundMeshHeight(x, z) > 2, 'native terrain must not cover the excavation');
      assert.ok(Math.abs(city.surfaceHeight(x, z) - city.groundMeshHeight(x, z)) < 0.1, 'the visible floor supports the player');
    }
  });
});
