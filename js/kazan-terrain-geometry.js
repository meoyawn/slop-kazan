import * as THREE from 'three/webgpu';
import { terrainVertexHeight, groundMeshHeight, terrainShoreFaces } from './kazan-config.js';
import { services } from './kazan-runtime.js';

/** Compile mapped terrain into upload-ready buffers, including banks and stairwell openings. */
export function createTerrainGeometry(b, step, textureBounds, holes = []) {
  const geometry = new THREE.PlaneGeometry(b.maxX - b.minX, b.maxZ - b.minZ,
    Math.ceil((b.maxX - b.minX) / step), Math.ceil((b.maxZ - b.minZ) / step));
  geometry.rotateX(-Math.PI / 2).translate((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
  const p = geometry.attributes.position, uv = geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const height = step === b.step ? terrainVertexHeight(b, p.getX(i), p.getZ(i)) : groundMeshHeight(p.getX(i), p.getZ(i));
    p.setY(i, height - 0.03);
    uv.setXY(i, (p.getX(i) - textureBounds.minX) / (textureBounds.maxX - textureBounds.minX),
      1 - (p.getZ(i) - textureBounds.minZ) / (textureBounds.maxZ - textureBounds.minZ));
  }
  const cols = geometry.parameters.widthSegments, rows = geometry.parameters.heightSegments;
  const mesh = step === b.step ? b : { ...b, cols, rows, stepX: (b.maxX - b.minX) / cols,
    stepZ: (b.maxZ - b.minZ) / rows, heights: null, shoreFaces: null, shoreState: null };
  const indices = [], source = geometry.index.array, positions = Array.from(p.array), uvs = Array.from(uv.array);
  for (let i = 0; i < source.length; i += 3) {
    const cell = Math.floor(i / 6), col = cell % cols, row = Math.floor(cell / cols), upper = (i / 3) % 2;
    const x = b.minX + (col + (upper ? 2 / 3 : 1 / 3)) * mesh.stepX;
    const z = b.minZ + (row + (upper ? 2 / 3 : 1 / 3)) * mesh.stepZ;
    if (holes.some((h) => x > h.minX && x < h.maxX && z > h.minZ && z < h.maxZ)) continue;
    const faces = terrainShoreFaces(mesh, col, row, upper);
    if (!faces) { indices.push(source[i], source[i + 1], source[i + 2]); continue; }
    for (const face of faces) {
      const first = positions.length / 3;
      for (const [x, z, y] of face) {
        positions.push(x, y - 0.03, z);
        uvs.push((x - textureBounds.minX) / (textureBounds.maxX - textureBounds.minX),
          1 - (z - textureBounds.minZ) / (textureBounds.maxZ - textureBounds.minZ));
      }
      indices.push(first, first + 2, first + 1);
    }
  }
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.deleteAttribute('normal');
  services.groundOpenings?.cutGeometry(geometry);
  geometry.computeVertexNormals();
  return geometry;
}
