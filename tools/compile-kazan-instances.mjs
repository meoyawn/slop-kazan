import * as THREE from 'three/webgpu';

/** Compile repeated unit boxes as final Float32 transforms and linear colours, with regional ownership. */
export function createInstanceCompiler(system) {
  const assets = new Map(), materials = new Map(), transform = new THREE.Object3D(), matrix = new THREE.Matrix4();
  const unitBounds = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
  const bounds = new THREE.Box3();
  const draw = {
    plainMaterial(hex, metalness = 0) {
      const key = `${hex}/${metalness}`;
      if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color: hex, metalness, roughness: metalness ? 0.38 : 0.85 }));
      return materials.get(key);
    },
    box(group, x, y, z, width, height, depth, material, yaw = 0, orientation = null) {
      const center = group.userData.regionCenter;
      const level = center ? 'detail' : group.userData.preparedLevel || 'structure';
      const region = [Math.floor((center?.[0] ?? x) / 1024), Math.floor((center?.[1] ?? z) / 1024)];
      const assetKey = level === 'structure' ? 'structure' : `${level}/${region}`;
      if (!assets.has(assetKey)) assets.set(assetKey, { level, regions: new Map() });
      const asset = assets.get(assetKey), cell = center || [Math.floor(x / 1024) * 1024 + 512, Math.floor(z / 1024) * 1024 + 512];
      const key = `${cell}/${material.metalness}`;
      if (!asset.regions.has(key)) asset.regions.set(key, { center: cell, metalness: material.metalness,
        count: 0, transforms: new Float32Array(2048), colours: new Float32Array(384), bounds: new THREE.Box3() });
      const batch = asset.regions.get(key);
      if (batch.count * 16 === batch.transforms.length) {
        const transforms = new Float32Array(batch.transforms.length * 2); transforms.set(batch.transforms); batch.transforms = transforms;
        const colours = new Float32Array(batch.colours.length * 2); colours.set(batch.colours); batch.colours = colours;
      }
      transform.position.set(x, y, z);
      if (orientation) transform.quaternion.copy(orientation);
      else transform.rotation.set(0, yaw, 0);
      transform.scale.set(width, height, depth); transform.updateMatrix();
      batch.transforms.set(transform.matrix.elements, batch.count * 16);
      batch.colours.set([material.color.r, material.color.g, material.color.b], batch.count * 3);
      matrix.fromArray(batch.transforms, batch.count * 16);
      batch.bounds.union(bounds.copy(unitBounds).applyMatrix4(matrix));
      batch.count++;
    },
    emit(group, geometry) { geometry.dispose(); },
    flush() {},
    shapeOf(ring) {
      return new THREE.Shape(Array.from({ length: ring.length / 2 }, (_, i) => new THREE.Vector2(ring[i * 2], -ring[i * 2 + 1])));
    }
  };
  async function write(writeGeometry) {
    for (const [id, asset] of assets) {
      const count = [...asset.regions.values()].reduce((sum, batch) => sum + batch.count, 0);
      const transforms = new Float32Array(count * 16), colours = new Float32Array(count * 3), batches = [];
      const box = new THREE.Box3();
      let start = 0;
      for (const batch of asset.regions.values()) {
        transforms.set(batch.transforms.subarray(0, batch.count * 16), start * 16);
        colours.set(batch.colours.subarray(0, batch.count * 3), start * 3);
        batches.push({ start, count: batch.count, center: batch.center, metalness: batch.metalness,
          bounds: [batch.bounds.min.toArray(), batch.bounds.max.toArray()] });
        box.union(batch.bounds); start += batch.count;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('transform', new THREE.BufferAttribute(transforms, 16));
      geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
      geometry.boundingBox = box; geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      geometry.userData.batches = batches;
      const centers = [...new Map(batches.map((batch) => [batch.center.join(','), batch.center])).values()];
      await writeGeometry({ system, id, level: asset.level, ...(asset.level === 'detail' ? { centers } : {}) }, geometry);
      geometry.dispose();
    }
    for (const material of materials.values()) material.dispose();
  }
  return { draw, write };
}
