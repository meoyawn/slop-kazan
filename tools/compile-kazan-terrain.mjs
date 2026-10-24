import { GEO } from '../js/kazan-runtime.js';
import { TERRAIN_MESHES } from '../js/kazan-config.js';
import '../js/kazan-pedestrian-structures.js';
import { createTerrainGeometry } from '../js/kazan-terrain-geometry.js';

/** Deterministic terrain recipe shared by release and local asset preparation. */
export async function compileTerrain({ writeGeometry }) {
  for (let id = 0; id < TERRAIN_MESHES.length; id++) {
    const grid = TERRAIN_MESHES[id];
    for (const level of grid.coarse ? ['detail', 'coarse'] : ['detail']) {
      const step = level === 'coarse' ? 90 : grid.step;
      const geometry = createTerrainGeometry(grid, step, grid.far ? GEO.terrainBounds : GEO.nearTerrainBounds, level === 'coarse' ? [] : grid.holes);
      await writeGeometry({ system: 'terrain', id, level }, geometry);
      geometry.dispose();
    }
    if (id % 100 === 0) console.log(`Compiled terrain ${id + 1}/${TERRAIN_MESHES.length}`);
  }
}
