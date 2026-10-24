import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import * as THREE from 'three/webgpu';
import { loadModule } from './helpers/module.js';

describe('Mapped school openings', () => {
  test('gates on either side of the origin leave openings while fences exactly outside their clearance remain solid', () => {
    const features = [
      { reference: 'fence', kind: 'fence', pts: [-48, 0, 48, 0] },
      ...[-16, 16].map((x) => ({ reference: `gate/${x}`, kind: 'gate', pts: [x, 0] })),
      { reference: 'cross-cell-gate', kind: 'gate', pts: [-0.01, 0] },
      { reference: 'offset-gate', kind: 'gate', pts: [-9, 5] },
      { reference: 'distant-gate', kind: 'gate', pts: [10000, 10000] }
    ];
    const { createKazanRecreation } = loadModule(readFileSync(new URL('../js/kazan-recreation.js', import.meta.url), 'utf8'), {
      imports: { 'three/webgpu': THREE, './kazan-runtime.js': { GEO: { recreation: [], education: { sites: [{ features, entrances: [] }] } }, runtime: {} },
        './kazan-config.js': { terrainHeight: () => 0, groundMeshHeight: () => 0, groundSurfaceHeight: () => 0, surfaceHeight: () => 0,
          toPoints: (ring) => Array.from({ length: ring.length / 2 }, (_, i) => ({ x: ring[i * 2], z: ring[i * 2 + 1] })),
          boundsOf: () => ({}), pointInPoly: () => false, projectGroundPolygon: () => null, nearestRoads: () => [] } }
    });
    const material = new THREE.MeshBasicMaterial(), scene = new THREE.Scene();
    const draw = {
      plainMaterial() { return material; },
      box(group, x, y, z, w, h, d, material, yaw = 0) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        mesh.position.set(x, y, z); mesh.rotation.y = yaw; group.add(mesh);
      },
      solid(group, geometry, material, x = 0, y = 0, z = 0) {
        const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); group.add(mesh);
      },
      emit(group, geometry, material) { group.add(new THREE.Mesh(geometry, material)); },
      polygon(ring, y, material, group) {
        const shape = new THREE.Shape(Array.from({ length: ring.length / 2 }, (_, i) => new THREE.Vector2(ring[i * 2], -ring[i * 2 + 1])));
        const geometry = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, y, 0);
        group.add(new THREE.Mesh(geometry, material));
      },
      flush() {}
    };
    createKazanRecreation(draw).build(scene); scene.updateMatrixWorld(true);
    function top(x) {
      return new THREE.Raycaster(new THREE.Vector3(x, 3, 0), new THREE.Vector3(0, -1, 0)).intersectObject(scene, true)[0]?.point.y;
    }
    assert.equal(top(-15), undefined, 'the negative-coordinate gate remains open');
    assert.equal(top(15), undefined, 'the positive-coordinate gate remains open');
    assert.equal(top(3), undefined, 'a gate across the origin still opens the adjacent span');
    for (const x of [-21, -9, 21]) assert.ok(Math.abs(top(x) - 1.43) < 1e-6, `fence at ${x} keeps the strict five-metre gate boundary`);
    scene.traverse((object) => object.geometry?.dispose()); material.dispose();
  });
});
