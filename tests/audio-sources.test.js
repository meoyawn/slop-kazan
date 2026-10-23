import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { loadModule } from './helpers/module.js';

describe('Kazan spatial audio sources', () => {
  test('traffic and footsteps stay audible at actual terrain and interpolated bridge heights without inventing crossing signals', () => {
    const { CityAudioSources } = loadModule(readFileSync(join(import.meta.dirname, '../js/audio-sources.js'), 'utf8'), {
      imports: { './kazan-config.js': { signalPhase: () => 'green', walkSignal: () => true,
        surfaceHeight: () => 200, roadHeight: (road) => road.height } }
    });
    const active = { type: 'car', speed: 0 };
    const car = { edge: { road: { height: 200 }, to: {} }, conn: { road0: { height: 180 }, road1: { height: 220 }, len: 10 },
      cs: 5, x: 0, z: 0, speed: 5, acc: 0, driver: { a: 2 }, yaw: 0, yawOffset: 0 };
    const ped = { placed: true, x: 0, z: 1, v: 0, rig: { seed: 1, phase: 0, feet: [{}, {}] } };
    const sources = new CityAudioSources({ controllerManager: { entities: {}, keys: {}, getActiveEntity: () => active },
      trafficSystem: { cars: [car], buses: [], peds: [ped] }, highwayTraffic: { cars: [] }, streetDetails: {} });
    const nearby = sources.collect({ x: 0, y: 201, z: 0 }, 0);
    assert.equal(nearby.motors.length, 1);
    assert.equal(nearby.motors[0].y, 200.77);
    assert.equal(nearby.people.length, 1);
    assert.equal(nearby.people[0].y, 200.07);
    assert.equal(nearby.signals.length, 0);
    const distant = sources.collect({ x: 0, y: 500, z: 0 }, 1);
    assert.equal(distant.motors.length, 0);
    assert.equal(distant.people.length, 0);
  });
});
