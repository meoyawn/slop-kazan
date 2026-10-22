const assert = require('node:assert/strict');
const { readFileSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const { test, describe } = require('node:test');
const vm = require('node:vm');

const root = join(__dirname, '..');
const context = vm.createContext({ window: {} });
for (const file of ['js/kazan-geodata.js', 'js/kazan-config.js', 'js/controllers.js']) {
  vm.runInContext(readFileSync(join(root, file), 'utf8'), context);
}
const city = context.window.NYC;

describe('Kazan geographic accuracy', () => {
  test('the Kremlin hill rises above the north riverbank and the controller uses that terrain', () => {
    const hill = city.NYC_LANDMARKS.find((l) => l.id === 'kremlin');
    const bank = city.NYC_LANDMARKS.find((l) => l.id === 'family');
    const hillY = city.terrainHeight(hill.x, hill.z), bankY = city.terrainHeight(bank.x, bank.z);
    assert.ok(hillY - bankY > 20, 'preserve the hill above the Kazanka instead of flattening the scene');
    const controller = Object.create(city.ThirdPersonControllerManager.prototype);
    for (const point of [hill, bank]) {
      assert.ok(Math.abs(controller.getGroundHeight(point.x, point.z, 'car') - city.surfaceHeight(point.x, point.z) - 0.07) < 1e-9);
    }
  });

  test('Kul Sharif keeps its mapped minarets above the low building outline', () => {
    const outline = city.GEO.buildings.find((b) => b.id === 230132591 && !b.part);
    assert.equal(outline.h, 8);
    assert.ok(outline.hasParts, 'the outline gives way to its detailed parts');
    const minarets = city.GEO.buildings.filter((b) => [230132595, 230132598, 230132599, 230132600].includes(b.id));
    assert.equal(minarets.length, 4, 'keep all four independently mapped minarets');
    for (const minaret of minarets) {
      assert.equal(minaret.h, 58);
      assert.equal(minaret.heightSource, 'osm-height');
    }
  });

  test('the Volga separates Kazan from the elevated west bank at Verkhniy Uslon', () => {
    const frame = city.GEO.frame;
    function point(lon, lat) {
      return { x: (lon - frame.origin.lon) * frame.kx, z: (frame.origin.lat - lat) * frame.kz };
    }
    const west = point(48.983, 55.770), river = point(49.020, 55.770);
    assert.equal(city.waterAt(west.x, west.z), null);
    assert.ok(city.terrainHeight(west.x, west.z) > 30, 'retain the real opposite-bank hill beyond the detailed city grid');
    assert.ok(city.waterAt(river.x, river.z), 'keep the reservoir between the shores');
  });

  test('every building part has a positive vertical extent, including roof-only parts', () => {
    for (const b of city.GEO.buildings) assert.ok(b.h > b.minHeight, `${b.osmType}/${b.id}: ${b.minHeight}–${b.h} m`);
  });

  test('arrivals and movement keep an open courtyard usable while its walls remain solid', () => {
    const controller = Object.create(city.ThirdPersonControllerManager.prototype);
    controller.activeMode = 'car';
    controller.entities = { car: { type: 'car', position: { x: 500, y: 0, z: 505 } } };
    controller.colliders = [{ minX: 480, maxX: 520, minZ: 480, maxZ: 520, minY: -100, maxY: 500,
      obb: { cx: 500, cz: 500, hx: 20, hz: 20, cs: 1, sn: 0 },
      poly: [[480,480],[520,480],[520,520],[512,520],[512,490],[488,490],[488,520],[480,520]].map(([x,z]) => ({x,z})), holes: [] }];
    const arrival = controller.findTeleportPosition(500, 505, 0, 0);
    assert.equal(arrival.x, 500);
    assert.equal(arrival.z, 505);
    const position = { x: 500, z: 505 };
    controller.resolveHorizontalCollision(position, 0.5, 5);
    assert.equal(position.x, 500);
    assert.equal(position.z, 505);
    position.x = 487.8;
    controller.resolveHorizontalCollision(position, 0.5, 5);
    assert.ok(position.x >= 488.49 && position.x < 489, 'push against the actual courtyard wall rather than the outer bounding box');
  });

  test('the Kazan bundle rebuilds offline from saved sources into a path with spaces and Tatar characters', () => {
    const dir = mkdtempSync(join(tmpdir(), 'Казан geography '));
    try {
      const output = join(dir, 'city data.js');
      const result = spawnSync(process.execPath, [join(root, 'tools/build-kazan-geodata.mjs'), output], { encoding: 'utf8', timeout: 30000 });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(readFileSync(output, 'utf8'), readFileSync(join(root, 'js/kazan-geodata.js'), 'utf8'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
