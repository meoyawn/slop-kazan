import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import * as geometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { createStaticPalette } from '../js/static-palette.js';
import { createInstanceVisibility } from '../js/instance-visibility.js';
import * as footprints from '../js/footprints.js';
import { loadModule } from './helpers/module.js';

const read = (name) => readFileSync(new URL(`../js/${name}`, import.meta.url), 'utf8');
const config = {
  CENTRAL_PARK_BOUNDS: {}, ISLAND_BOUNDS: {}, SPAWN: { x: 0, z: 0 },
  terrainHeight: () => 0,
  toPoints: (ring) => Array.from({ length: ring.length / 2 }, (_, i) => ({ x: ring[i * 2], z: ring[i * 2 + 1] })),
  boundsOf: footprints.polygonBounds,
  pointInPoly: footprints.polygonContains
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
      const mosque = { ...common, id: 3, kind: 'mosque', h: 8, hasParts: true, ring: [160, 0, 180, 0, 180, 20, 160, 20] };
      const porch = { ...common, id: 4, part: true, parent: 'way/3', h: 4, ring: [160, 0, 164, 0, 164, 4, 160, 4] };
      const binding = { reference: 'way/3', faith: 'mosque', family: 'mosque', role: 'principal', style: { minaretHeight: 24 } };
      const compound = { ...common, id: 5, kind: 'mosque', h: 12, roofShape: 'dome',
        ring: [220, 0, 250, 0, 250, 10, 230, 10, 230, 30, 220, 30] };
      const towerStub = { ...common, id: 6, towerType: 'minaret', heightSource: 'fallback', h: 12, minHeight: 9,
        ring: [263, 14, 265, 14, 265, 16, 263, 16] };
      imports['three/webgpu'] = THREE;
      imports['three/addons/utils/BufferGeometryUtils.js'] = geometryUtils;
      imports['./static-palette.js'] = { createStaticPalette };
      imports['./instance-visibility.js'] = { createInstanceVisibility };
      imports['./footprints.js'] = footprints;
      imports['./kazan-runtime.js'] = { GEO: { buildings: [...(shortFirst ? [shed, tower] : [tower, shed]), mosque, porch, compound, towerStub], landmarks: [],
        worship: { bindings: [binding, { ...binding, reference: 'way/4', parent: 'way/3', role: 'mapped-part' },
          { ...binding, reference: 'way/5' }, { ...binding, reference: 'way/6', role: 'minaret' }] } }, runtime: {} };
      imports['./kazan-config.js'] = config;
      imports['./kazan-worship.js'] = loadModule(read('kazan-worship.js'), { imports: {
        'three/webgpu': THREE, './kazan-runtime.js': imports['./kazan-runtime.js'], './kazan-config.js': config
      } });
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
      const far = scene.getObjectByName('KazanMassingRegion/0,0'), transform = new THREE.Matrix4();
      let worshipInstances = 0, houseInstances = 0;
      for (let i = 0; i < far.instanceMatrix.count; i++) {
        far.getMatrixAt(i, transform);
        const x = transform.elements[12], glazing = far.geometry.attributes.kFacadeGlass.getW(i);
        if (x >= 160) { worshipInstances++; assert.equal(glazing, 0, 'religious massing never inherits apartment windows'); }
        else if (x > 70) { houseInstances++; assert.equal(glazing, 1, 'ordinary tall buildings retain their windows'); }
      }
      assert.ok(worshipInstances >= 2 && houseInstances === 1);
      const minaret = new THREE.Raycaster(new THREE.Vector3(170, 40, 10), new THREE.Vector3(0, -1, 0)).intersectObject(scene)[0];
      assert.ok(minaret?.point.y > 23.5, 'a mapped porch does not suppress the estimated mosque minaret');
      const wall = new THREE.Raycaster(new THREE.Vector3(155, 2, 10), new THREE.Vector3(1, 0, 0)).intersectObject(scene)[0];
      assert.equal(wall?.object.material.colorNode, null, 'near mosque walls use the shared plain/arched family');
      const emptyCourtyard = new THREE.Raycaster(new THREE.Vector3(240, 30, 20), new THREE.Vector3(0, -1, 0)).intersectObject(scene);
      assert.equal(emptyCourtyard.length, 0, 'a compound domed mosque never becomes a bounding-box-sized roof plate');
      const supportedTower = new THREE.Raycaster(new THREE.Vector3(264, 40, 15), new THREE.Vector3(0, -1, 0)).intersectObject(scene)[0];
      assert.ok(supportedTower?.point.y > 23.5, 'a fallback-height minaret becomes a complete estimated shaft, not a raised stub');
      const shaft = new THREE.Raycaster(new THREE.Vector3(260, 5, 15), new THREE.Vector3(1, 0, 0)).intersectObject(scene)[0];
      assert.ok(shaft && shaft.distance < 5, 'the estimated shaft connects to its foundation');
      assert.deepEqual([towerStub.h, towerStub.minHeight], [12, 9], 'source heights remain separate from the visual estimate');
    });
  }
});
