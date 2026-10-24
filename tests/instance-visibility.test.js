import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import * as THREE from 'three/webgpu';
import { createInstanceVisibility } from '../js/instance-visibility.js';

describe('Regional instance ownership', () => {
  test('tile eviction and return keep transforms, paint and every interleaved facade field together', () => {
    const geometry = new THREE.BoxGeometry();
    const packed = new THREE.InstancedInterleavedBuffer(new Float32Array(12 * 9), 9);
    geometry.setAttribute('wall', new THREE.InterleavedBufferAttribute(packed, 3, 0));
    geometry.setAttribute('roof', new THREE.InterleavedBufferAttribute(packed, 3, 3));
    geometry.setAttribute('windows', new THREE.InterleavedBufferAttribute(packed, 3, 6));
    geometry.setAttribute('seed', new THREE.InstancedBufferAttribute(new Float32Array(12), 1));
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicNodeMaterial(), 12);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(36), 3);
    const matrix = new THREE.Matrix4();
    for (let id = 0; id < 12; id++) {
      mesh.setMatrixAt(id, matrix.makeTranslation(id * 17, id * 2, -id * 11));
      mesh.instanceColor.array.set([id / 16, id / 32, id / 64], id * 3);
      geometry.attributes.seed.setX(id, id + 100);
      for (let field = 0; field < 9; field++) packed.array[id * 9 + field] = id * 1000 + field;
    }
    mesh.computeBoundingSphere();
    const bounds = mesh.boundingSphere.clone();
    const owners = Array.from({ length: 4 }, (_, i) => ({ key: i, start: i * 3, count: 3 }));
    const visibility = createInstanceVisibility(mesh, owners);
    mesh.instanceMatrix = new THREE.StorageInstancedBufferAttribute(mesh.instanceMatrix.array, 16);
    const shown = new Set([0, 1, 2, 3]);
    for (let visit = 0; visit < 160; visit++) {
      const owner = (visit * 7 + Math.floor(visit / 4)) % 4;
      const visible = visit % 7 > 2;
      visibility.setVisible(owner, visible);
      visibility.setVisible(owner, visible);
      if (visible) shown.add(owner); else shown.delete(owner);
      const actual = new Set();
      assert.equal(mesh.count, shown.size * 3);
      for (let row = 0; row < mesh.count; row++) {
        mesh.getMatrixAt(row, matrix);
        const id = matrix.elements[12] / 17;
        assert.ok(shown.has(Math.floor(id / 3)), 'only currently distant tiles are rendered');
        assert.ok(!actual.has(id), 'each mapped building appears exactly once');
        actual.add(id);
        assert.equal(matrix.elements[13], id * 2);
        assert.equal(matrix.elements[14], -id * 11);
        assert.deepEqual(Array.from(mesh.instanceColor.array.subarray(row * 3, row * 3 + 3)), [id / 16, id / 32, id / 64]);
        assert.equal(geometry.attributes.seed.getX(row), id + 100);
        for (let field = 0; field < 9; field++) assert.equal(packed.array[row * 9 + field], id * 1000 + field);
      }
      assert.ok(mesh.boundingSphere.equals(bounds), 'the conservative full-region bounds remain valid through compaction');
    }
    for (const owner of owners) visibility.setVisible(owner.key, true);
    assert.equal(mesh.count, 12);
    assert.equal(new Set(Array.from({ length: 12 }, (_, row) => geometry.attributes.seed.getX(row))).size, 12);
    assert.ok(packed.version > 0, 'changed facade rows are uploaded along with transforms');
    assert.ok(mesh.instanceMatrix.version > 0, 'the currently bound matrix buffer is uploaded after renderer storage conversion');
  });
});
