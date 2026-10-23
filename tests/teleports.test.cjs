const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test, describe } = require('node:test');
const vm = require('node:vm');
const { gunzipSync } = require('node:zlib');

const read = (path) => readFileSync(join(__dirname, '..', path), 'utf8');
let TELEPORT_LOCATIONS, LANDMARK_SITES, blockAt, nearestRoads, getIslandBoundsAtZ;
test.before(async () => {
  ({ TELEPORT_LOCATIONS, LANDMARK_SITES, blockAt, nearestRoads, getIslandBoundsAtZ } = await import('../js/city-config.js'));
});

describe('Kazan arrivals', () => {

test('every Kazan destination lands on a road outside buildings and water', () => {
  const buttons = [...read('index.html').matchAll(/data-teleport="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(Object.keys(TELEPORT_LOCATIONS).sort(), buttons.sort());
  for (const [name, point] of Object.entries(TELEPORT_LOCATIONS)) {
    assert.ok(Number.isFinite(point.heading), `${name} has a heading`);
    assert.equal(blockAt(point.x, point.z), null, `${name} lands outside building blocks`);
    const shore = getIslandBoundsAtZ(point.z);
    assert.ok(point.x > shore.westX + 8 && point.x < shore.eastX - 8, `${name} stays in the simulated city`);
    assert.ok(isOnLand(point.x, point.z), `${name} avoids open water`);
    const nearby = nearestRoads(point.x, point.z, 20);
    assert.ok(nearby.some(({ road, dist }) => dist < road.w / 2), `${name} lands within a street's width`);
  }
});

test('Kul Sharif arrival faces the mosque from its real street approach', () => {
  const point = TELEPORT_LOCATIONS.kulsharif;
  const mosque = LANDMARK_SITES['Kul Sharif Mosque'];
  const distance = Math.hypot(mosque.x - point.x, mosque.z - point.z);
  assert.ok(distance > 30 && distance < 300, 'leave space for the mosque view');
  const alignment = ((mosque.x - point.x) * Math.sin(point.heading) + (mosque.z - point.z) * Math.cos(point.heading)) / distance;
  assert.ok(alignment > 0.999, 'face the mosque');
});

test('preset and map teleports share arrival resets and mark the resolved landing point', () => {
  const main = read('js/main.js');
  const start = main.indexOf('  function teleportTo(');
  const end = main.indexOf('  const openMapBtn', start);
  const handlers = new Map();
  const calls = [];
  const landed = { x: -305.7, z: 5210 };
  let map;
  const environment = {
    TELEPORT_LOCATIONS,
    controllerManager: {
      teleportActiveTo: (...args) => { calls.push(['teleport', ...args]); return landed; }
    },
    touchControls: { reset: () => calls.push(['touch']) },
    gamepadControls: { reset: () => calls.push(['gamepad']) },
    cameraSystem: { resetForTeleport: () => calls.push(['camera']) },
    selectCamera: (...args) => calls.push(['selectCamera', ...args]),
    getLocationLabel: (x, z) => `${x}, ${z}`,
    cityBlocks: { allBlocks: [] },
    trafficSystem: {},
    NYCMapSystem: class {
      constructor(options) { this.onTeleport = options.onTeleport; map = this; }
    },
    teleportButtons: Object.keys(TELEPORT_LOCATIONS).map((key) => ({
      getAttribute: () => key,
      addEventListener: (_event, handler) => handlers.set(key, handler)
    })),
    closePopovers: () => {}
  };
  vm.runInNewContext(main.slice(start, end), environment);
  for (const [name, point] of Object.entries(TELEPORT_LOCATIONS)) {
    calls.length = 0;
    handlers.get(name)();
    assert.deepEqual(calls, [
      ['teleport', point.x, point.z, point.heading], ['touch'], ['gamepad'], ['camera'], ['selectCamera', 'chase', true]
    ]);
    assert.equal(map.waypoint.x, landed.x);
    assert.equal(map.waypoint.z, landed.z);
  }
  map.waypoint = { x: 100, z: 200, name: 'inside a building' };
  map.onTeleport(100, 200);
  assert.equal(map.waypoint.x, landed.x, 'map marker follows the safe position returned by the controller');
  assert.equal(map.waypoint.z, landed.z);
  assert.equal(map.waypoint.name, `${landed.x}, ${landed.z}`);
});

});
