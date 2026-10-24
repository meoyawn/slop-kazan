import * as THREE from 'three/webgpu';
import { createRoadPaintGeometries } from './road-paint-geometry.js';
import { createRoadPaintMaterial } from './tsl-materials.js';

/** Build markings from the same geometry recipe used by the offline world compiler. */
export function buildRoadPaint(scene, network) {
  const chunks = createRoadPaintGeometries(network);
  let vertices = 0, indices = 0;
  for (const chunk of chunks.values()) { vertices += chunk.attributes.position.count; indices += chunk.index.count; }
  const mesh = new THREE.BatchedMesh(Math.max(1, chunks.size), Math.max(1, vertices), Math.max(1, indices), createRoadPaintMaterial());
  mesh.sortObjects = false;
  for (const chunk of chunks.values()) {
    mesh.addInstance(mesh.addGeometry(chunk));
    chunk.dispose();
  }
  mesh.name = 'RoadMarkings';
  mesh.receiveShadow = true;
  mesh.renderOrder = -1;
  scene.add(mesh);
  return mesh;
}
