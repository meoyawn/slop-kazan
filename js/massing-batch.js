import * as THREE from 'three/webgpu';

/** Keep the original tile visibility and facade records while submitting distant buildings together. */
export function createMassingBatch(group, tiles, material) {
  const sources = [...tiles.values()].map((tile) => tile.far);
  if (!sources.length) return;
  const capacity = sources.reduce((sum, source) => sum + source.count, 0);
  const template = sources[0].geometry;
  const stride = template.attributes.kFacadeSize.data.stride;
  const geometry = template.clone();
  const data = new THREE.InstancedInterleavedBuffer(new Float32Array(capacity * stride), stride);
  data.setUsage(THREE.DynamicDrawUsage);
  for (const [name, attribute] of Object.entries(template.attributes)) {
    if (attribute.data?.isInstancedInterleavedBuffer) {
      geometry.setAttribute(name, new THREE.InterleavedBufferAttribute(data, attribute.itemSize, attribute.offset, attribute.normalized));
    }
  }
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = 'KazanMassing';
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = mesh.matrixWorldAutoUpdate = false;
  mesh.count = 0;
  const spheres = sources.map((source) => source.boundingSphere.clone().applyMatrix4(source.matrixWorld));
  const visible = new Uint8Array(sources.length);
  visible.fill(255);
  const frustum = new THREE.Frustum();
  const projection = new THREE.Matrix4();
  mesh.onBeforeRender = (renderer, scene, camera) => {
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projection, camera.coordinateSystem, camera.reversedDepth);
    let changed = false;
    for (let i = 0; i < sources.length; i++) {
      const next = sources[i].visible && frustum.intersectsSphere(spheres[i]) ? 1 : 0;
      if (visible[i] !== next) { visible[i] = next; changed = true; }
    }
    if (!changed) return;
    let count = 0;
    for (let i = 0; i < sources.length; i++) {
      if (!visible[i]) continue;
      const source = sources[i];
      mesh.instanceMatrix.array.set(source.instanceMatrix.array.subarray(0, source.count * 16), count * 16);
      data.array.set(source.geometry.attributes.kFacadeSize.data.array.subarray(0, source.count * stride), count * stride);
      count += source.count;
    }
    mesh.count = count;
    if (count) {
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, count * 16);
      mesh.instanceMatrix.needsUpdate = true;
      data.clearUpdateRanges();
      data.addUpdateRange(0, count * stride);
      data.needsUpdate = true;
    }
  };
  for (const source of sources) group.remove(source);
  group.add(mesh);
}
