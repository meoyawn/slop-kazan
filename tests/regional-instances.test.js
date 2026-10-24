import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import * as THREE from 'three/webgpu';
import { loadModule } from './helpers/module.js';
import { createInstanceCompiler } from '../tools/compile-kazan-instances.mjs';
import { encodeGeometry } from '../tools/encode-geometry.mjs';
import { decodeGeometry } from '../js/geometry-buffer.js';

describe('Prepared repeated infrastructure', () => {
  test('compiled sloping rails retain equipment, colours and independent regional lifetime through pending travel and return', async () => {
    const ground = (x, z) => x * 0.01 + z * 0.003;
    const source = { tracks: [0, 1040, 20000, -30000].map((x, id) => ({ id, kind: 'rail', pts: [x, 0, x + 60, 0], nodes: [id * 2, id * 2 + 1],
      tracks: 1, gauge: [1520], electrified: 'contact_line', layer: id === 3 ? 1 : 0, bridge: id === 3 })),
    platforms: [], graph: { nodes: [], links: [] } };
    const { createRailwayPaths, createKazanRailways } = loadModule(readFileSync(new URL('../js/kazan-railways.js', import.meta.url), 'utf8'), {
      imports: { 'three/webgpu': THREE, './kazan-runtime.js': { GEO: {}, runtime: {}, services: {} },
        './kazan-config.js': { terrainHeight: ground, groundSurfaceHeight: ground, nearestRoads: () => [],
          toPoints: (ring) => Array.from({ length: ring.length / 2 }, (_, i) => ({ x: ring[i * 2], z: ring[i * 2 + 1] })) } }
    });
    const compiler = createInstanceCompiler('rail'), entries = [], payloads = new Map();
    createKazanRailways(compiler.draw, createRailwayPaths(source), 'TestRailway', { precomputeDetails: true });
    await compiler.write(async (descriptor, geometry) => {
      const box = geometry.boundingBox;
      const entry = { ...descriptor, bounds: [box.min.x, box.min.z, box.max.x, box.max.z] };
      entries.push(entry); payloads.set(entry.id, await encodeGeometry(geometry));
    });
    const requests = [], disposed = [];
    let releaseDetail, arrivedBed, holdFar = false;
    const farBed = entries.find((entry) => entry.level === 'bed' && entry.bounds[0] > 19000);
    const world = {
      entries,
      async loadGeometry(entry) {
        requests.push(entry.id);
        if (holdFar && entry.level === 'detail' && entry.centers.some(([x]) => x > 19000)) await new Promise((resolve) => { releaseDetail = resolve; });
        const geometry = await decodeGeometry(payloads.get(entry.id));
        geometry.addEventListener('dispose', () => disposed.push(entry.id));
        if (holdFar && entry === farBed) arrivedBed();
        return geometry;
      }
    };
    const { prepareRegionalInstances } = loadModule(readFileSync(new URL('../js/regional-instances.js', import.meta.url), 'utf8'), {
      imports: { 'three/webgpu': THREE, './kazan-runtime.js': { services: { worldReady: false } },
        './prepared-world.js': { async loadPreparedWorld() { return world; } } }
    });
    const assets = await prepareRegionalInstances('rail', { x: 0, z: 0 }), group = new THREE.Group(), materials = [];
    assets.attach(group, (hex, metalness) => {
      const material = new THREE.MeshStandardMaterial({ color: hex, metalness }); materials.push(material); return material;
    });
    function height(x, z = 0) {
      group.updateMatrixWorld(true);
      const meshes = []; group.traverseVisible((object) => { if (object.isMesh) meshes.push(object); });
      return new THREE.Raycaster(new THREE.Vector3(x, ground(x, z) + 2, z), new THREE.Vector3(0, -1, 0)).intersectObjects(meshes, false)[0]?.point.y;
    }
    assert.ok(Math.abs(height(30, 0.795) - ground(30, 0) - 0.495) < 0.0002, 'the rail head keeps its mapped gauge, slope and clearance');
    assert.ok(Math.abs(height(1.3) - ground(1.3, 0) - 0.36) < 0.0001, 'near sleepers sit above the ballast');
    assert.ok(Math.abs(height(1041.3) - ground(1041.3, 0) - 0.33) < 0.0002, 'equipment outside its original radius is absent while the bed remains');
    const permanent = group.children.find((owner) => owner.name.endsWith('/structure'));
    assert.ok(permanent?.children.length, 'distant bridge and portal parts remain resident');
    const steel = new THREE.Color(0x929a99);
    let foundSteel = false;
    group.traverse((mesh) => {
      if (!mesh.isInstancedMesh) return;
      assert.equal(mesh.instanceMatrix.array.buffer, mesh.instanceColor.array.buffer, 'a part family shares the transported allocation');
      if (mesh.material.metalness === 0.6) {
        assert.deepEqual(Array.from(mesh.instanceColor.array.subarray(0, 3)), [steel.r, steel.g, steel.b].map(Math.fround));
        foundSteel = true;
      }
    });
    assert.ok(foundSteel);
    await assets.prepareAround(600, 0); assets.update(600, 0);
    assert.ok(Math.abs(height(1041.3) - ground(1041.3, 0) - 0.36) < 0.0002, 'the same stored equipment becomes visible when its owner is near');
    holdFar = true;
    const bedArrived = new Promise((resolve) => { arrivedBed = resolve; });
    const arrival = assets.prepareAround(20000, 0);
    await bedArrived;
    await new Promise((resolve) => setImmediate(resolve));
    assets.update(600, 0);
    assert.ok(!disposed.includes(farBed.id), 'an arrival pins completed beds while its other equipment is still downloading');
    releaseDetail(); await arrival; holdFar = false;
    assets.update(20000, 0);
    assert.ok(Math.abs(height(20001.3) - ground(20001.3, 0) - 0.36) < 0.0002, 'prepared travel mounts the complete destination');
    assert.equal(height(30), undefined, 'departed local storage is evicted');
    assert.ok(permanent.parent === group, 'global structures survive local eviction');
    await assets.prepareAround(0, 0); assets.update(0, 0);
    assert.ok(Math.abs(height(30, 0.795) - ground(30, 0) - 0.495) < 0.0002);
    assert.equal(requests.filter((id) => id === farBed.id).length, 1);
    await assets.prepareAround(20000, 0); assets.update(0, 0);
    assert.equal(disposed.filter((id) => id === farBed.id).length, 2, 'cancelled travel releases destination storage even when the camera stays still');
    group.traverse((object) => { if (object.isMesh) { object.geometry.dispose(); object.dispose(); } });
    for (const material of materials) material.dispose();
  });
});
