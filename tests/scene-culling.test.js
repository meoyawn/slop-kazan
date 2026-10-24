import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import * as THREE from 'three/webgpu';
import { createInstanceVisibility } from '../js/instance-visibility.js';
import { loadModule } from './helpers/module.js';

describe('Spatial static batches and streamed owners', () => {
  test('static cells reduce submitted instances while mutable owners retain complete live records', () => {
    const { setupSceneCulling } = loadModule(readFileSync(process.env.SCENE_CULLING_SOURCE || new URL('../js/scene-culling.js', import.meta.url), 'utf8'), { imports: { 'three/webgpu': THREE } });
    const count = 4096, scene = new THREE.Scene(), root = new THREE.Group(); scene.add(root);
    function batch() {
      const geometry = new THREE.BoxGeometry(10, 10, 10);
      geometry.setAttribute('identity', new THREE.InstancedBufferAttribute(Float32Array.from({ length: count }, (_, i) => i), 1));
      const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicNodeMaterial(), count), matrix = new THREE.Matrix4();
      for (let i = 0; i < count; i++) mesh.setMatrixAt(i, matrix.makeTranslation(i < count / 2 ? 20 : 10020, 5, i % 16));
      root.add(mesh); return mesh;
    }
    batch();
    const mutable = batch(), owners = [{ key: 'near', start: 0, count: count / 2 }, { key: 'far', start: count / 2, count: count / 2 }];
    const visibility = createInstanceVisibility(mutable, owners);
    setupSceneCulling(scene, [root]);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500); camera.position.set(20, 30, 100); camera.lookAt(20, 5, 0); camera.updateMatrixWorld();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const staticMeshes = root.children.filter((mesh) => mesh !== mutable);
    assert.equal(staticMeshes.reduce((n, mesh) => n + mesh.count, 0), count, 'partitioning retains every static instance');
    assert.equal(staticMeshes.filter((mesh) => frustum.intersectsObject(mesh)).reduce((n, mesh) => n + mesh.count, 0), count / 2,
      'the distant half is rejected by the real camera frustum');
    for (const visible of [false, true, false, true]) {
      visibility.setVisible('far', visible);
      const live = [], matrix = new THREE.Matrix4();
      root.traverseVisible((mesh) => {
        if (!mesh.isInstancedMesh || staticMeshes.includes(mesh)) return;
        for (let row = 0; row < mesh.count; row++) {
          mesh.getMatrixAt(row, matrix);
          const id = mesh.geometry.attributes.identity.getX(row);
          assert.equal(matrix.elements[12], id < count / 2 ? 20 : 10020, 'identity fields and transforms remain paired');
          live.push(id);
        }
      });
      assert.equal(new Set(live).size, visible ? count : count / 2, 'evicted owners disappear and return exactly once');
      assert.ok(live.every((id) => visible || id < count / 2));
    }
  });
});
