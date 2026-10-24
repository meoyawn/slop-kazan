import { createTeleport } from '../js/teleports.js';
import { runCityModule } from './helpers/module.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, describe } from 'node:test';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';

const read = (path) => readFileSync(join(import.meta.dirname, '..', path), 'utf8');
const context = vm.createContext({ window: { NYC: { GEO: JSON.parse(gunzipSync(readFileSync(join(import.meta.dirname, '../js/kazan-geodata.json.gz')))) } } });
runCityModule(read('js/kazan-config.js'), context);
const { TELEPORT_LOCATIONS, LANDMARK_SITES, blockAt, nearestRoads, getIslandBoundsAtZ, isOnLand } = context.window.NYC;

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

test('prepared preset and map arrivals reset controls and mark the resolved landing point', async () => {
  const calls = [], landed = { x: -305.7, z: 5210 }, map = {};
  let ready;
  const teleport = createTeleport({
    controllerManager: { teleportActiveTo: (...args) => { calls.push(['teleport', ...args]); return landed; } },
    touchControls: { reset: () => calls.push(['touch']) },
    gamepadControls: { reset: () => calls.push(['gamepad']) },
    cameraSystem: { resetForTeleport: () => calls.push(['camera']) },
    selectCamera: (...args) => calls.push(['selectCamera', ...args]),
    getMap: () => map,
    getLocationLabel: (x, z) => `${x}, ${z}`,
    prepareDestination: () => new Promise((resolve) => { ready = resolve; })
  });
  for (const point of [...Object.values(TELEPORT_LOCATIONS), { x: 100, z: 200, heading: Math.PI }]) {
    calls.length = 0;
    const pending = teleport(point.x, point.z, point.heading);
    assert.deepEqual(calls, [], 'the current scene stays active until the destination is prepared');
    ready();
    assert.equal(await pending, landed);
    assert.deepEqual(calls, [
      ['teleport', point.x, point.z, point.heading], ['touch'], ['gamepad'], ['camera'], ['selectCamera', 'chase', true]
    ]);
    assert.equal(map.waypoint.x, landed.x);
    assert.equal(map.waypoint.z, landed.z);
    assert.equal(map.waypoint.name, `${landed.x}, ${landed.z}`);
  }
});

test('a slow earlier map request cannot replace a newer prepared arrival', async () => {
  const arrivals = [], ready = new Map(), map = {};
  const teleport = createTeleport({
    controllerManager: { teleportActiveTo(x, z) { arrivals.push([x, z]); return { x, z }; } },
    touchControls: { reset() {} }, gamepadControls: { reset() {} }, cameraSystem: { resetForTeleport() {} },
    selectCamera() {}, getMap: () => map, getLocationLabel: () => 'destination',
    prepareDestination: (x) => new Promise((resolve) => ready.set(x, resolve))
  });
  const first = teleport(10, 20), second = teleport(30, 40);
  ready.get(30)(); await second;
  ready.get(10)(); await first;
  assert.deepEqual(arrivals, [[30, 40]]);
  assert.equal(map.waypoint.x, 30);
  assert.equal(map.waypoint.z, 40);
});

});
