import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import * as THREE from 'three/webgpu';
import { decodeGeometry } from '../js/geometry-buffer.js';
import { encodeGeometry } from '../tools/encode-geometry.mjs';

describe('Prepared geometry transport', () => {
  test('a downloaded indexed surface retains its slope, UVs and culling bounds without expanding its arrays', async () => {
    for (const Type of [Uint16Array, Uint32Array]) {
      const source = new THREE.BufferGeometry();
      source.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 0, 0, 3, 4, 6, 4, 0], 3));
      source.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0], 2));
      source.setIndex(new THREE.BufferAttribute(new Type([0, 1, 2]), 1));
      source.computeVertexNormals();
      source.computeBoundingBox(); source.computeBoundingSphere();
      source.boundingBox.expandByScalar(32); source.boundingSphere.radius += 32;
      const payload = await encodeGeometry(source), geometry = await decodeGeometry(payload);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
      mesh.updateMatrixWorld(true);
      const hit = new THREE.Raycaster(new THREE.Vector3(1.5, 20, 1), new THREE.Vector3(0, -1, 0)).intersectObject(mesh)[0];
      assert.ok(hit, 'a transported facet remains visible from above');
      assert.ok(Math.abs(hit.point.y - 2.25) < 1e-6, 'the uploaded facet retains its original plane');
      assert.ok(hit.uv.distanceTo(new THREE.Vector2(0.25, 0.25)) < 1e-6, 'texture interpolation survives the file boundary');
      assert.ok(hit.normal.y > 0, 'the transported surface keeps its winding and lighting normal');
      assert.ok(geometry.boundingBox.containsPoint(new THREE.Vector3(6, 4, 0)));
      assert.ok(geometry.boundingBox.containsPoint(new THREE.Vector3(-30, 1, 0)), 'shader displacement padding survives transport');
      assert.equal(geometry.boundingSphere.radius, source.boundingSphere.radius);
      for (const attribute of [geometry.index, ...Object.values(geometry.attributes)]) {
        assert.equal(attribute.array.buffer, geometry.attributes.position.array.buffer, 'all attributes share one decoded allocation');
      }
      await assert.rejects(decodeGeometry(payload.slice(0, -4)), /Truncated/, 'a partial transfer cannot appear as complete geometry');
      geometry.dispose(); source.dispose(); mesh.material.dispose();
    }
  });
});
