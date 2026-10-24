import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import * as THREE from 'three/webgpu';
import { loadModule } from './helpers/module.js';

const read = (name) => readFileSync(new URL(`../js/${name}`, import.meta.url), 'utf8');

describe('Prepared marking clearance recovery', () => {
  test('changed clearances regenerate physical dead-end paint independently of the traffic graph', async () => {
    const points = [[0, 0], [100, 0], [100, 100], [0, 100], [145, 0]];
    const roads = points.map((_, id) => ({ id, kind: 'primary' }));
    const config = {
      ALL_AVENUES: [], ALL_STREETS: [], AVENUES: [], STREETS: [], BLOCKS: [], ROADS: roads,
      ISLAND_BOUNDS: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 },
      getIslandBoundsAtZ: () => ({ westX: -1000, eastX: 1000 }), terrainHeight: () => 0, roadHeight: () => 0
    };
    const runtime = { runtime: {}, services: {}, GEO: { roadGraph: { nodes: points.flat(), names: ['Mapped street'],
      links: [[0, 1], [1, 2], [2, 3], [3, 0], [1, 4]].map(([a, b], i) => [a, b, 0, 7.6, 2, 1, [], i]) } } };
    const network = loadModule(read('road-network.js'), { imports: { './kazan-config.js': config, './kazan-runtime.js': runtime }, globals: { console } });
    const traffic = network.buildRoadNetwork([], [], { paint: false });
    assert.equal(traffic.paintEdges, null, 'ambient traffic does not retain a city-wide physical paint snapshot');
    assert.ok(traffic.edges.every((edge) => edge.road !== roads[4]), 'the spur is outside the circulating traffic component');
    const material = { createRoadPaintMaterial() { return new THREE.MeshBasicNodeMaterial(); } };
    const geometry = loadModule(read('road-paint-geometry.js'), { imports: {
      'three/webgpu': THREE, './road-network.js': network, './kazan-runtime.js': runtime, './kazan-config.js': config
    } });
    const paint = loadModule(read('road-paint.js'), { imports: {
      'three/webgpu': THREE, './road-paint-geometry.js': geometry, './tsl-materials.js': material
    } });
    const markings = loadModule(read('kazan-marking-assets.js'), { imports: {
      'three/webgpu': THREE, './kazan-runtime.js': runtime, './road-network.js': network, './road-paint.js': paint,
      './tsl-materials.js': material, './traffic-obstacles.js': { async trafficObstacleVersion() { return 'current'; } },
      './prepared-world.js': { async loadPreparedWorld() { return { entries: [{ system: 'markings', obstacleVersion: 'previous' }] }; } },
      './regional-surfaces.js': { async prepareRegionalSurfaces() { return { prepareAround() {}, update() {}, attach() { throw new Error('Stale prepared paint must not mount'); } }; } }
    }, globals: { console: { warn() {} } } });
    await markings.prepareMarkings({ x: 0, z: 0 });
    const scene = new THREE.Scene();
    await runtime.services.markingAssets.attach(scene, [], []);
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(125, 5, 0), new THREE.Vector3(0, -1, 0));
    assert.ok(ray.intersectObject(scene).length, 'the physical dead-end street keeps its paint during clearance recovery');
  });
});
