const { runCityModule } = require('./helpers/module.cjs');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { describe, test } = require('node:test');
const vm = require('node:vm');

/** A roof, a landing square and an aircraft exercise the real flight and building collision controller. */
function flight(y, x = 0) {
  const nyc = { ISLAND_BOUNDS: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 },
    landingSurfaceAt(x, z, clearance) { return Math.abs(x) <= 12 - clearance && Math.abs(z) <= 12 - clearance ? { y: 40 } : null; } };
  const context = { window: { NYC: nyc } };
  runCityModule(readFileSync(join(__dirname, '../js/controllers.js'), 'utf8'), context);
  const controller = Object.create(context.window.NYC.ThirdPersonControllerManager.prototype);
  const aircraft = { position: { x, y, z: 0 }, speed: 0, verticalSpeed: -8, heading: 0, pitchAngle: 0, rollAngle: 0,
    tiltPivot: { rotation: { x: 0, z: 0 }, position: { y: 0 } } };
  controller.activeMode = 'helicopter';
  controller.entities = { helicopter: aircraft };
  controller.colliders = [{ minX: -20, maxX: 20, minZ: -20, maxZ: 20, minY: 0, maxY: 40 }];
  controller.keys = { down: true };
  controller.getGroundHeight = () => 0;
  function advance(frames) { for (let i = 0; i < frames; i++) controller.updateHelicopter(0.05, i * 0.05); }
  return { controller, aircraft, advance };
}

describe('Helicopter roof landing', () => {
  test('descending onto a roof pad rests on the deck without sideways ejection and can take off again', () => {
    const { controller, aircraft, advance } = flight(65);
    advance(100);
    assert.ok(Math.abs(aircraft.position.y - 40.04) < 1e-9, 'skids rest just above the deck');
    assert.equal(aircraft.position.x, 0);
    assert.equal(aircraft.position.z, 0);
    assert.equal(aircraft.verticalSpeed, 0);
    assert.equal(aircraft.tiltPivot.position.y, 0, 'a landed aircraft has no flight bob');
    controller.keys = { up: true };
    advance(20);
    assert.ok(aircraft.position.y > 45, 'take off using the ordinary flight control');
    assert.ok(aircraft.verticalSpeed > 0);
    assert.equal(aircraft.landed, false);
  });

  test('the pad cannot pull an aircraft up through its underside or support one outside its clearance', () => {
    for (const [y, x] of [[35, 0], [55, 15]]) {
      const { aircraft, advance } = flight(y, x);
      advance(100);
      assert.ok(aircraft.position.y < 40, 'only a descent from above inside the pad can land on it');
      assert.ok(Math.abs(aircraft.position.x) >= 24.5, 'the building wall still excludes aircraft below the roof');
    }
  });
});
