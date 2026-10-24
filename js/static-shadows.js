import * as THREE from 'three/webgpu';
import { SHADOW_PROXY_LAYER } from './scene-culling.js';

const CELL = 500, materials = new Map();
const identity = new THREE.Matrix4();

/** Immutable regional owners retain their own position-only shadow geometry through hiding and eviction. */
export function prepareStaticShadows(owner) {
  owner.updateMatrixWorld(true);
  const sources = [];
  owner.traverse((mesh) => {
    const material = mesh.material, geometry = mesh.geometry;
    if (!mesh.isMesh || !mesh.castShadow || !mesh.visible || mesh.userData.shadowProxy || mesh.isBatchedMesh || mesh.isSkinnedMesh ||
        mesh.morphTargetInfluences || mesh.layers.mask !== 1 || !mesh.frustumCulled || !mesh.matrixWorld.equals(identity) ||
        mesh.customDepthMaterial || mesh.customDistanceMaterial || Object.hasOwn(mesh, 'onBeforeRender') || Object.hasOwn(mesh, 'onAfterRender') ||
        Object.hasOwn(mesh, 'onBeforeShadow') || Object.hasOwn(mesh, 'onAfterShadow') ||
        !material || Array.isArray(material) || !material.visible || !material.allowOverride || material.transparent || material.opacity !== 1 ||
        material.map || material.alphaMap || material.alphaTest || material.alphaToCoverage || material.opacityNode || material.transmission || material.transmissionNode || material.backdropNode ||
        material.positionNode || material.vertexNode || material.fragmentNode || material.castShadowPositionNode || material.castShadowNode || material.alphaTestNode || material.maskNode || material.maskShadowNode || material.depthNode || material.displacementMap ||
        material.clippingPlanes?.length || material.colorNode && !material.userData.opaqueShadow ||
        !geometry?.attributes.position || !(geometry.attributes.position.array instanceof Float32Array) || geometry.attributes.position.itemSize !== 3 || geometry.attributes.position.isInterleavedBufferAttribute || geometry.attributes.position.isInstancedBufferAttribute ||
        geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity ||
        mesh.isInstancedMesh && mesh.count !== mesh.instanceMatrix.count) return;
    sources.push(mesh);
  });
  const parents = new Map();
  function materialFor(material) {
    const key = `${material.side}/${material.shadowSide}`;
    if (!materials.has(key)) {
      const proxy = new THREE.MeshBasicNodeMaterial({ color: 0, side: material.side });
      proxy.shadowSide = material.shadowSide; proxy.name = 'RegionalShadow';
      materials.set(key, proxy);
    }
    return materials.get(key);
  }
  function add(parent, mesh) {
    mesh.name = 'RegionalShadow'; mesh.userData.shadowProxy = true;
    mesh.layers.set(SHADOW_PROXY_LAYER); mesh.castShadow = true;
    mesh.matrixAutoUpdate = mesh.matrixWorldAutoUpdate = false;
    parent.add(mesh);
  }
  for (const source of sources) {
    const parent = source.parent, geometry = source.geometry, position = geometry.attributes.position, index = geometry.index;
    const material = materialFor(source.material);
    if (!parents.has(parent)) parents.set(parent, { triangles: new Map(), instances: new Map() });
    const batches = parents.get(parent);
    if (source.isInstancedMesh) {
      const signature = position.count <= 128 && (!index || index.count <= 512)
        ? `${Array.from(new Uint32Array(position.array.buffer, position.array.byteOffset, position.array.length))}/${index ? Array.from(index.array) : ''}`
        : geometry.uuid;
      const values = source.instanceMatrix.array;
      for (let i = 0; i < source.count; i++) {
        const offset = i * 16, cell = `${Math.floor(values[offset + 12] / CELL)},${Math.floor(values[offset + 14] / CELL)}`;
        const key = `${material.uuid}/${signature}/${cell}`;
        if (!batches.instances.has(key)) batches.instances.set(key, { geometry, material, values: [] });
        const batch = batches.instances.get(key);
        for (let j = 0; j < 16; j++) batch.values.push(values[offset + j]);
      }
    } else {
      const count = index ? index.count : position.count;
      for (let i = 0; i < count; i += 3) {
        const a = index ? index.getX(i) : i, b = index ? index.getX(i + 1) : i + 1, c = index ? index.getX(i + 2) : i + 2;
        const cell = `${Math.floor((position.getX(a) + position.getX(b) + position.getX(c)) / (CELL * 3))},${Math.floor((position.getZ(a) + position.getZ(b) + position.getZ(c)) / (CELL * 3))}`;
        const key = `${material.uuid}/${cell}`;
        if (!batches.triangles.has(key)) batches.triangles.set(key, { material, values: [] });
        const batch = batches.triangles.get(key);
        for (const id of [a, b, c]) batch.values.push(position.getX(id), position.getY(id), position.getZ(id));
      }
    }
    source.castShadow = false;
  }
  for (const [parent, batches] of parents) {
    for (const batch of batches.triangles.values()) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.values, 3));
      geometry.computeBoundingSphere(); add(parent, new THREE.Mesh(geometry, batch.material));
    }
    for (const batch of batches.instances.values()) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', batch.geometry.attributes.position.clone());
      if (batch.geometry.index) geometry.setIndex(batch.geometry.index.clone());
      const mesh = new THREE.InstancedMesh(geometry, batch.material, 0);
      mesh.instanceMatrix = new THREE.StorageInstancedBufferAttribute(new Float32Array(batch.values), 16);
      mesh.count = batch.values.length / 16; mesh.computeBoundingSphere(); add(parent, mesh);
    }
  }
}
