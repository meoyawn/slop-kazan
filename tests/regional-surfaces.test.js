import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import * as THREE from 'three/webgpu';
import { loadModule } from './helpers/module.js';
import { encodeGeometry } from '../tools/encode-geometry.mjs';
import { decodeGeometry } from '../js/geometry-buffer.js';

describe('Prepared regional surface residency', () => {
  test('distant travel evicts local geometry and restores transported surfaces on return while raised decks persist', async () => {
    const entries = [0, 20000, -30000].map((x, id) => ({ system: 'roads', id, surface: 'asphalt', bounds: [x, 0, x + 6, 6], elevated: id === 2 }));
    const payloads = [];
    for (const [id, entry] of entries.entries()) {
      const x = entry.bounds[0], geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([x, id + 1, 0, x, id + 1, 6, x + 6, id + 1, 0], 3));
      geometry.setIndex([0, 1, 2]); geometry.computeVertexNormals();
      payloads.push(await encodeGeometry(geometry)); geometry.dispose();
    }
    const requests = [], disposed = [];
    const world = {
      entries,
      async loadGeometry(entry) {
        requests.push(entry.id);
        const geometry = await decodeGeometry(payloads[entry.id]);
        geometry.addEventListener('dispose', () => disposed.push(entry.id));
        return geometry;
      }
    };
    const { prepareRegionalSurfaces } = loadModule(readFileSync(new URL('../js/regional-surfaces.js', import.meta.url), 'utf8'), {
      imports: { 'three/webgpu': THREE, './kazan-runtime.js': { services: { worldReady: false } }, './prepared-world.js': { async loadPreparedWorld() { return world; } } }
    });
    const assets = await prepareRegionalSurfaces('roads', { x: 0, z: 0 });
    const group = new THREE.Group(), material = new THREE.MeshBasicMaterial();
    assets.attach(group, { asphalt: material });
    function surfaceAt(x) {
      group.updateMatrixWorld(true);
      const visible = []; group.traverseVisible((object) => { if (object.isMesh) visible.push(object); });
      return new THREE.Raycaster(new THREE.Vector3(x + 1, 100, 1), new THREE.Vector3(0, -1, 0)).intersectObjects(visible, false)[0]?.point.y;
    }
    assert.equal(surfaceAt(0), 1);
    assert.equal(surfaceAt(-30000), 3);
    assert.equal(surfaceAt(20000), undefined, 'distant ground is not eagerly downloaded');
    await Promise.all([assets.prepareAround(20000, 0), assets.prepareAround(20000, 0)]);
    assets.update(20000, 0);
    assert.equal(surfaceAt(20000), 2, 'prepared arrival mounts exact destination surfaces');
    assert.equal(surfaceAt(0), undefined);
    assert.equal(surfaceAt(-30000), 3);
    assert.deepEqual(disposed, [0], 'only the departed ground allocation is evicted');
    await assets.prepareAround(0, 0); assets.update(0, 0);
    assert.equal(surfaceAt(0), 1, 'return travel restores the uploaded facet');
    assert.equal(surfaceAt(-30000), 3);
    assert.equal(requests.filter((id) => id === 0).length, 2);
    assert.equal(requests.filter((id) => id === 1).length, 1, 'concurrent arrivals share the pending download');
    assert.equal(requests.filter((id) => id === 2).length, 1);
    group.traverse((object) => { if (object.isMesh) object.geometry.dispose(); }); material.dispose();
  });
});
