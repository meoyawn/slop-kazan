import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three/webgpu';
import { prepareStaticShadows } from '../js/static-shadows.js';
import { SHADOW_PROXY_LAYER } from '../js/scene-culling.js';

test('regional shadow casters preserve independent shapes and nested owner lifetime', () => {
  const scene = new THREE.Scene(), owner = new THREE.Group(), nested = new THREE.Group();
  scene.add(owner); owner.add(nested);
  const material = new THREE.MeshStandardNodeMaterial();
  for (const x of [-501, -1, 1, 499, 501]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(8, 12, 8).translate(x, 6, 20), material);
    mesh.castShadow = true; nested.add(mesh);
  }
  // Equal counts and bounds are insufficient to identify an instanced shape.
  for (let i = 0; i < 2; i++) {
    const geometry = new THREE.BoxGeometry(8, 12, 8);
    if (i) {
      const p = geometry.attributes.position;
      for (let j = 0; j < p.count; j++) if (p.getX(j) > 0 && p.getY(j) > 0) p.setY(j, 0);
    }
    const mesh = new THREE.InstancedMesh(geometry, material, 1);
    mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(30 + i * 20, 6, 20));
    mesh.castShadow = true; nested.add(mesh);
  }
  function heights(layer, shadowOnly) {
    scene.updateMatrixWorld(true);
    return [-501, -1, 1, 499, 501, 32, 52].map((x) => {
      const meshes = [];
      scene.traverseVisible((mesh) => { if (mesh.isMesh && (!shadowOnly || mesh.castShadow)) meshes.push(mesh); });
      const ray = new THREE.Raycaster(new THREE.Vector3(x, 30, 20), new THREE.Vector3(0, -1, 0));
      ray.layers.set(layer);
      return ray.intersectObjects(meshes, false)[0]?.point.y;
    });
  }
  const expected = [12, 12, 12, 12, 12, 12, 7.5];
  assert.deepEqual(heights(0, true), expected);
  prepareStaticShadows(owner);
  assert.deepEqual(heights(SHADOW_PROXY_LAYER, true), expected);
  assert.deepEqual(heights(0, false), expected, 'facade geometry remains in the main view');
  nested.visible = false;
  assert.deepEqual(heights(SHADOW_PROXY_LAYER, true), expected.map(() => undefined));
  nested.visible = true; scene.remove(owner);
  assert.deepEqual(heights(SHADOW_PROXY_LAYER, true), expected.map(() => undefined), 'eviction leaves no scene-global shadows');
  scene.add(owner);
  assert.deepEqual(heights(SHADOW_PROXY_LAYER, true), expected);
});
