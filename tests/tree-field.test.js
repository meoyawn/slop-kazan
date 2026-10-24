import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import * as THREE from 'three/webgpu';
import { createCanvas } from '@napi-rs/canvas';
import { loadModule } from './helpers/module.js';

describe('Streamed tree rendering', () => {
  test('spatial tree storage stays bounded and preserves roots through travel, eviction and return', () => {
    const source = readFileSync(process.env.TREE_FIELD_SOURCE || new URL('../js/trees.js', import.meta.url), 'utf8');
    const { createTreeField } = loadModule(source, { imports: { 'three/webgpu': THREE,
      './tsl-materials.js': { createTreeMaterial: () => new THREE.MeshStandardNodeMaterial() } },
      globals: { document: { createElement: () => createCanvas(1, 1) } } });
    const scene = new THREE.Scene(), sites = [0, 15, 800, 820].map((x, i) => ({ x, z: i * 8, y: i, scale: 1, species: i % 3 }));
    const field = createTreeField(scene, sites, { capacity: 128 }), material = field.material, atlas = field.atlas;
    let disposals = 0;
    function roots() {
      const result = [], matrix = new THREE.Matrix4();
      field.group.traverseVisible((mesh) => {
        if (!mesh.isInstancedMesh) return;
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, matrix);
          result.push([matrix.elements[12], matrix.elements[13], matrix.elements[14]]);
        }
      });
      return result.sort((a, b) => a[0] - b[0]);
    }
    function check(next, x) {
      field.update(new THREE.Vector3(x, 20, 100));
      assert.deepEqual(roots(), next.map((p) => [p.x, p.y, p.z]));
      assert.equal(field.stats.trees, next.length);
      assert.ok(field.meshes.reduce((n, mesh) => n + mesh.instanceMatrix.count, 0) <= next.length * 6,
        'streaming capacity is local to actual cell/species populations rather than reserved per whole-map family');
      assert.equal(field.material, material); assert.equal(field.atlas, atlas);
    }
    check(sites, 0);
    assert.ok(field.group.children.filter((g) => g.visible).length > 1, 'separate occupied cells can be culled independently');
    for (const mesh of field.meshes) mesh.geometry.addEventListener('dispose', () => disposals++);
    for (let visit = 1; visit <= 6; visit++) {
      const next = sites.map((p) => ({ ...p, x: p.x + visit * 6000 }));
      field.setSites(next); check(next, visit * 6000);
    }
    assert.ok(disposals > 0, 'departed cell buffers are released');
    field.setSites(sites); check(sites, 0);
    field.setSites(sites); field.update(new THREE.Vector3(20000, 20, 100));
    assert.equal(roots().length, 0, 'a refreshed cell outside every LOD must clear its previous visible records');
    field.update(new THREE.Vector3(0, 20, 100));
    assert.deepEqual(roots(), sites.map((p) => [p.x, p.y, p.z]));
    field.setSites([]); field.update(new THREE.Vector3(0, 20, 100));
    assert.equal(roots().length, 0); assert.equal(field.meshes.length, 0);
  });
});
