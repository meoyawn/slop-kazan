const { runCityModule } = require('./helpers/module.cjs');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { gunzipSync } = require('node:zlib');
const { describe, test } = require('node:test');
const vm = require('node:vm');
const { join } = require('node:path');

function scene() {
  const data = JSON.parse(gunzipSync(readFileSync(join(__dirname,'../js/kazan-geodata.json.gz'))));
  const context = vm.createContext({ window: { NYC: { GEO: data } } });
  runCityModule(readFileSync(join(__dirname,'../js/kazan-config.js'), 'utf8'), context);
  context.NYC = context.window.NYC;
  runCityModule(readFileSync(join(__dirname,'../js/kazan-churches.js'), 'utf8'), context);
  const city = context.window.NYC, models = city.createKazanChurchModels({ plainMaterial: () => ({}) });
  return { city, models, church: data.buildings.find((b) => b.id === 90251716) };
}

function solidAt(city, shapes, x, z, y) {
  return shapes.some((s) => y >= s.minHeight && y < s.h && city.pointInPoly(city.toPoints(s.ring), x, z));
}

const churchScene = scene();

describe('Photographed church access', () => {
  test('the real west portico stays open below its beam while the columns and church wall stay solid', () => {
    const { city, models, church } = churchScene, shapes = models.collisionShapes?.(church) || [church];
    assert.equal(solidAt(city, shapes, 128, -1009.3, 1.4), false, 'the centre of the photographed portico is walkable');
    assert.equal(solidAt(city, shapes, 126.84, -1011.64, 1.4), true, 'the southern front column remains solid');
    assert.equal(solidAt(city, shapes, 134, -1011, 1.4), true, 'the nave does not become a passage');
    assert.equal(solidAt(city, shapes, 128, -1009.3, 5.4), true, 'the portico beam remains solid above the walkable opening');
  });

  test('west entrance walking climbs individual treads onto the raised landing', () => {
    const { city } = churchScene, nx = -20.6 / Math.hypot(3.3, 20.6), nz = 3.3 / Math.hypot(3.3, 20.6);
    const x = 133.95 + nx * 3.5, z = -1010.25 + nz * 3.5;
    let y = city.surfaceHeight(x + nx * 10.1, z + nz * 10.1), flatRuns = 0, risers = 0;
    const bottom = y;
    for (let d = 9.85; d >= 1; d -= 0.04) {
      const next = city.surfaceHeight(x + nx * d, z + nz * d, y + 0.07), change = next - y;
      assert.ok(change >= -0.02 && change < 0.25, 'walk without falling through a tread or jumping to the landing');
      if (Math.abs(change) < 0.0001) flatRuns++;
      if (change > 0.05) risers++;
      y = next;
    }
    assert.ok(y - bottom > 2.5, 'reach the photographed raised entrance instead of staying on the DEM beneath it');
    assert.ok(flatRuns > 120 && risers >= 14, 'treads are horizontal, with distinct risers');
  });
});
