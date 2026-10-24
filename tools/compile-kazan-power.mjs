import { createKazanPowerLines } from '../js/kazan-power-lines.js';
import { createInstanceCompiler } from './compile-kazan-instances.mjs';

/** Use the live support/span recipe once offline; keep final unit transforms and conductor positions. */
export async function compilePower({ writeGeometry }) {
  const compiler = createInstanceCompiler('power');
  const { group } = createKazanPowerLines({ plainMaterial: compiler.draw.plainMaterial, buildingCollider: () => null });
  for (const cell of group.children) {
    cell.userData.preparedLevel = 'network';
    for (const mesh of cell.children) {
      if (mesh.isInstancedMesh) compiler.addTransforms(cell, mesh.instanceMatrix.array, mesh.material);
      else if (mesh.isLineSegments) compiler.addLines(cell, mesh.geometry.attributes.position.array, mesh.material.color.getHex());
      else throw new Error('Unsupported prepared power part');
    }
  }
  await compiler.write(writeGeometry);
  group.traverse((object) => { if (object.geometry) object.geometry.dispose(); if (object.isInstancedMesh) object.dispose(); });
  const materials = new Set(); group.traverse((object) => { if (object.material) materials.add(object.material); });
  for (const material of materials) material.dispose();
}
