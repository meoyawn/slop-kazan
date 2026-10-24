import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import * as geometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { createStaticPalette } from '../js/static-palette.js';
import { createInstanceVisibility } from '../js/instance-visibility.js';
import { loadModule } from './helpers/module.js';

const read = (name) => readFileSync(new URL(`../js/${name}`, import.meta.url), 'utf8');
const config = {
  CENTRAL_PARK_BOUNDS: {}, ISLAND_BOUNDS: {}, SPAWN: { x: 0, z: 0 },
  terrainHeight: () => 0,
  toPoints: (ring) => Array.from({ length: ring.length / 2 }, (_, i) => ({ x: ring[i * 2], z: ring[i * 2 + 1] })),
  boundsOf: (points) => ({ minX: Math.min(...points.map((p) => p.x)), maxX: Math.max(...points.map((p) => p.x)),
    minZ: Math.min(...points.map((p) => p.z)), maxZ: Math.max(...points.map((p) => p.z)) }),
  pointInPoly: () => false
};

function unusedModels() {
  return { emitBuilding() { return false; }, collisionShapes() { return null; } };
}

describe('Procedural building facade lifecycle', () => {
  for (const shortFirst of [true, false]) {
    test(`short and tall buildings retain their material families when ${shortFirst ? 'the short building' : 'the tower'} loads first`, () => {
      const runtime = { runtime: {} };
      const materials = loadModule(read('tsl-materials.js'), { imports: {
        'three/webgpu': THREE, 'three/tsl': TSL, './kazan-config.js': config, './kazan-runtime.js': runtime
      } });
      const facades = loadModule(read('kazan-facades.js'), { imports: {
        'three/webgpu': THREE, 'three/tsl': TSL, './tsl-materials.js': materials
      } });
      const source = read('kazan-city.js'), imports = {};
      for (const match of source.matchAll(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/gm)) {
        imports[match[2]] = Object.fromEntries(match[1].split(',').map((name) => [name.trim(), unusedModels]));
      }
      const common = { osmType: 'way', kind: 'yes', material: '', colour: '', minHeight: 0,
        holes: [], roofShape: 'flat', roofHeight: 0, roofMaterial: '', roofColour: '' };
      const shed = { ...common, id: 1, h: 3, ring: [0, 0, 10, 0, 10, 10, 0, 10] };
      const tower = { ...common, id: 2, h: 72, ring: [80, 0, 90, 0, 90, 10, 80, 10] };
      imports['three/webgpu'] = THREE;
      imports['three/addons/utils/BufferGeometryUtils.js'] = geometryUtils;
      imports['./static-palette.js'] = { createStaticPalette };
      imports['./instance-visibility.js'] = { createInstanceVisibility };
      imports['./kazan-runtime.js'] = { GEO: { buildings: shortFirst ? [shed, tower] : [tower, shed], landmarks: [] }, runtime: {} };
      imports['./kazan-config.js'] = config;
      imports['./tsl-materials.js'] = materials;
      imports['./kazan-facades.js'] = facades;
      imports['./kazan-campus.js'] = { createKazanCampusModels() { return { ...unusedModels(), collisionShapes: (b) => [b] }; } };
      const timers = [];
      const city = loadModule(source, { imports, globals: { performance, setTimeout(fn) { timers.push(fn); return timers.length; } } });
      const scene = new THREE.Scene();
      city.buildCityBlocks(scene);
      while (timers.length) timers.shift()();
      scene.updateMatrixWorld(true);
      const towerHit = new THREE.Raycaster(new THREE.Vector3(75, 35, 5), new THREE.Vector3(1, 0, 0)).intersectObject(scene)[0];
      const shedHit = new THREE.Raycaster(new THREE.Vector3(-5, 1.5, 5), new THREE.Vector3(1, 0, 0)).intersectObject(scene)[0];
      assert.ok(towerHit?.object.material.colorNode, 'a tall wall keeps its procedural windows');
      assert.equal(shedHit?.object.material.colorNode, null, 'an unobserved low shed retains its plain wall treatment');
    });
  }
});
