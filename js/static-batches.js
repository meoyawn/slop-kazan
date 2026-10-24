import * as THREE from 'three/webgpu';

/** Share buffers and material bindings without changing each piece's frustum or LOD visibility. */
export function setupStaticBatches(scene, roots, shadow = null) {
  const pending = new Set();
  const batches = new Set();
  const observed = new WeakSet();
  const detachedGeometry = new THREE.BufferGeometry();
  const shadowCameras = new Set();
  if (shadow?.getCamera) {
    for (let i = 0; i < shadow.getViewportCount(); i++) shadowCameras.add(shadow.getCamera(i));
  }

  function observe(group, root) {
    if (observed.has(group) || group.isMesh || group.isSprite) return;
    if (group.name.startsWith('Tram/')) return;
    observed.add(group);
    group.updateMatrixWorld(true);
    group.matrixAutoUpdate = group.matrixWorldAutoUpdate = false;
    pending.add(root);
    group.addEventListener('childadded', (event) => {
      if (event.child.isBatchedMesh) return;
      pending.add(root);
      observe(event.child, root);
    });
    for (const child of group.children) observe(child, root);
  }

  function batchGroup(group) {
    const compatible = new Map();
    const center = new THREE.Vector3();
    group.traverse((mesh) => {
      if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isBatchedMesh || mesh.isSkinnedMesh ||
          mesh.morphTargetInfluences || mesh.matrixAutoUpdate || mesh.matrixWorldAutoUpdate ||
          Array.isArray(mesh.material) || mesh.material.transparent ||
          Object.hasOwn(mesh, 'onBeforeRender') || Object.hasOwn(mesh, 'onAfterRender')) return;
      const geometry = mesh.geometry;
      if (geometry.groups.length || geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return;
      const attributes = Object.entries(geometry.attributes).sort(([a], [b]) => a.localeCompare(b));
      if (attributes.some(([, attribute]) => attribute.isInstancedBufferAttribute || attribute.isInterleavedBufferAttribute)) return;
      let region = '';
      if (geometry.attributes.position.count > 16384) {
        if (!geometry.boundingSphere) geometry.computeBoundingSphere();
        center.copy(geometry.boundingSphere.center).applyMatrix4(mesh.matrixWorld);
        region = `${Math.floor(center.x / 8192)},${Math.floor(center.z / 8192)}`;
      }
      const signature = [region, mesh.material.uuid, mesh.castShadow, mesh.receiveShadow, mesh.layers.mask, mesh.renderOrder,
        !!geometry.index, ...attributes.map(([name, attribute]) => `${name}/${attribute.itemSize}/${attribute.normalized}/${attribute.array.constructor.name}`)].join('|');
      if (!compatible.has(signature)) compatible.set(signature, []);
      compatible.get(signature).push(mesh);
    });
    for (const sources of compatible.values()) {
      if (sources.length < 5) continue;
      const vertices = sources.reduce((sum, mesh) => sum + mesh.geometry.attributes.position.count, 0);
      const indices = sources.reduce((sum, mesh) => sum + (mesh.geometry.index?.count || 0), 0);
      const first = sources[0];
      const mesh = new THREE.BatchedMesh(sources.length, vertices, indices, first.material);
      mesh.name = `StaticBatch/${group.name}`;
      mesh.castShadow = first.castShadow;
      mesh.receiveShadow = first.receiveShadow;
      mesh.layers.mask = first.layers.mask;
      mesh.renderOrder = first.renderOrder;
      mesh.sortObjects = false;
      mesh.perObjectFrustumCulled = false;
      mesh.matrixAutoUpdate = mesh.matrixWorldAutoUpdate = false;
      const ids = [];
      const parents = [];
      const spheres = [];
      const geometries = [];
      for (const source of sources) {
        const geometry = mesh.addGeometry(source.geometry);
        const id = mesh.addInstance(geometry);
        mesh.setMatrixAt(id, source.matrixWorld);
        mesh.setVisibleAt(id, source.visible);
        ids.push(id);
        geometries.push(geometry);
        parents.push(source.parent);
        if (!source.geometry.boundingSphere) source.geometry.computeBoundingSphere();
        spheres.push(source.geometry.boundingSphere.clone().applyMatrix4(source.matrixWorld));
        source.parent.remove(source);
        source.geometry.dispose();
        source.geometry = detachedGeometry;
      }
      group.add(mesh);
      batches.add({ mesh, sources, ids, geometries, parents, spheres, shown: new Uint8Array(sources.length), group,
        version: 0, cameras: new WeakMap() });
    }
  }

  for (const root of roots) observe(root, root);
  const beforeRender = scene.onBeforeRender;
  const afterRender = scene.onAfterRender;
  const cameras = [];
  const projection = new THREE.Matrix4();
  const frustum = new THREE.Frustum();
  const cameraStates = new WeakMap();

  function prepareVisibility() {
    for (const record of batches) {
      const { mesh, sources, geometries, parents, spheres, shown, group } = record;
      let parent = group;
      while (parent.parent) parent = parent.parent;
      if (parent !== scene) {
        mesh.dispose();
        for (const source of sources) source?.geometry.dispose();
        batches.delete(record);
        continue;
      }
      let retained = false;
      for (let i = 0; i < sources.length; i++) {
        if (!sources[i]) continue;
        let visible = sources[i].visible;
        let ancestor = parents[i];
        while (ancestor && ancestor !== group) {
          visible &&= ancestor.visible;
          ancestor = ancestor.parent;
        }
        if (ancestor !== group) {
          mesh.deleteGeometry(geometries[i]);
          sources[i].geometry.dispose();
          sources[i] = parents[i] = spheres[i] = null;
          shown[i] = 0;
          record.version++;
        } else {
          const next = visible ? 1 : 0;
          if (shown[i] !== next) { shown[i] = next; record.version++; }
          retained = true;
        }
      }
      if (!retained) {
        group.remove(mesh);
        mesh.dispose();
        batches.delete(record);
      }
    }
  }

  function applyVisibility(camera) {
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projection, camera.coordinateSystem, camera.reversedDepth);
    let state = cameraStates.get(camera);
    if (!state) {
      state = { projection: new THREE.Matrix4(), version: 0 };
      cameraStates.set(camera, state);
    }
    if (!state.projection.equals(projection)) {
      state.projection.copy(projection);
      state.version++;
    }
    const shadows = shadowCameras.has(camera);
    for (const record of batches) {
      const { mesh, sources, ids, spheres, shown } = record;
      if (!mesh.layers.test(camera.layers) || (shadows && !mesh.castShadow)) {
        mesh.visible = false;
        continue;
      }
      let cached = record.cameras.get(camera);
      if (!cached) {
        cached = { mask: new Uint8Array(sources.length), version: -1, cameraVersion: -1 };
        record.cameras.set(camera, cached);
      }
      if (cached.version !== record.version || cached.cameraVersion !== state.version || cached.frustumCulled !== mesh.frustumCulled) {
        cached.visible = false;
        for (let i = 0; i < sources.length; i++) {
          const draw = Boolean(sources[i] && shown[i] && (!mesh.frustumCulled || !sources[i].frustumCulled || frustum.intersectsSphere(spheres[i])));
          cached.mask[i] = draw ? 1 : 0;
          cached.visible ||= draw;
        }
        cached.version = record.version;
        cached.cameraVersion = state.version;
        cached.frustumCulled = mesh.frustumCulled;
      }
      for (let i = 0; i < sources.length; i++) {
        if (sources[i]) mesh.setVisibleAt(ids[i], Boolean(cached.mask[i]));
      }
      mesh.visible = cached.visible;
    }
  }

  scene.onBeforeRender = (renderer, renderedScene, camera, target) => {
    beforeRender.call(scene, renderer, renderedScene, camera, target);
    if (renderedScene !== scene) return;
    if (!cameras.length) {
      for (const group of pending) batchGroup(group);
      pending.clear();
      prepareVisibility();
    }
    cameras.push(camera);
    applyVisibility(camera);
  };
  scene.onAfterRender = (renderer, renderedScene, camera, target) => {
    afterRender.call(scene, renderer, renderedScene, camera, target);
    if (renderedScene !== scene) return;
    cameras.pop();
    if (cameras.length) applyVisibility(cameras.at(-1));
  };
}
