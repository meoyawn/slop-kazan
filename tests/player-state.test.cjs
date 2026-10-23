const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { describe, test } = require('node:test');
const { loadModule } = require('./helpers/module.cjs');

function playerState(storage) {
  return loadModule(readFileSync(join(__dirname, '../js/player-state.js'), 'utf8'), {
    imports: { './kazan-config.js': { ISLAND_BOUNDS: { minX: -10000, maxX: 10000, minZ: -10000, maxZ: 10000 } } },
    globals: { localStorage: storage }
  });
}

describe('Kazan player persistence', () => {
  test('round trips all travel modes through Kazan storage and safe teleport placement, including aircraft altitude', () => {
    const values = new Map([['nyc-player-state', 'unrelated-city-state']]);
    const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
    const { savePlayerState, restorePlayerState } = playerState(storage);
    const entities = Object.fromEntries(['person', 'car', 'cyclist', 'helicopter'].map((mode, i) => [mode, {
      position: { x: i * 10, y: 100 + i, z: -i * 20 }, heading: i * 0.5
    }]));
    const placements = [];
    const controllers = { entities, activeMode: 'helicopter', setMode(mode) { this.activeMode = mode; },
      teleportActiveTo(...position) { placements.push([this.activeMode, ...position]); } };
    savePlayerState(controllers);
    controllers.activeMode = 'car';
    restorePlayerState(controllers);
    assert.equal(controllers.activeMode, 'helicopter');
    assert.deepEqual(placements, [['person', 0, 0, 0, 100], ['car', 10, -20, 0.5, 101],
      ['cyclist', 20, -40, 1, 102], ['helicopter', 30, -60, 1.5, 103]]);
    assert.equal(values.get('nyc-player-state'), 'unrelated-city-state');
    assert.equal(JSON.parse(values.get('kazan-player-state')).city, 'kazan');
  });

  test('foreign saves, invalid coordinates and unavailable storage leave a usable player', () => {
    const placements = [];
    const controllers = { entities: { car: {} }, activeMode: 'car', setMode(mode) { this.activeMode = mode; },
      teleportActiveTo(...position) { placements.push(position); } };
    for (const value of ['not json', JSON.stringify({ version: 1, city: 'new-york', activeMode: 'car', entities: { car: { x: 0, y: 0, z: 0, heading: 0 } } }),
      JSON.stringify({ version: 1, city: 'kazan', entities: { car: { x: 999999, y: 0, z: 0, heading: 0 } } }),
      JSON.stringify({ version: 1, city: 'kazan', entities: { car: { x: null, y: 0, z: 0, heading: 0 } } })]) {
      playerState({ getItem: () => value }).restorePlayerState(controllers);
    }
    playerState({ getItem() { throw new Error('denied'); } }).restorePlayerState(controllers);
    playerState({ setItem() { throw new Error('full'); } }).savePlayerState(controllers);
    assert.deepEqual(placements, []);
    assert.equal(controllers.activeMode, 'car');
  });
});
