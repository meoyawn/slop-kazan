import { TERRAIN_MESHES } from './kazan-config.js';
import { services, loading } from './kazan-runtime.js';
import { loadPreparedWorld } from './prepared-world.js';

/** Fetch prepared terrain now; fetch distant exact detail only when its existing LOD needs it. */
export async function prepareTerrain(initialPosition) {
  const world = await loadPreparedWorld();
  const descriptors = new Map(world.entries.filter((entry) => entry.system === 'terrain').map((entry) => [`${entry.id}/${entry.level}`, entry]));
  const ids = new Map(TERRAIN_MESHES.map((grid, id) => [grid, id]));
  const geometries = new Map(), pending = new Map();
  async function load(id, level) {
    const key = `${id}/${level}`;
    if (geometries.has(key)) return geometries.get(key);
    if (pending.has(key)) return pending.get(key);
    async function download() {
      const entry = descriptors.get(key);
      if (!entry) throw new Error(`Missing terrain asset ${key}`);
      const geometry = await world.loadGeometry(entry);
      geometries.set(key, geometry);
      return geometry;
    }
    const task = download().finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  }
  services.terrainAssets = {
    geometryFor(grid, step) {
      const key = `${ids.get(grid)}/${step === grid.step ? 'detail' : 'coarse'}`;
      const geometry = geometries.get(key);
      if (!geometry) throw new Error(`Terrain region ${key} is not ready`);
      return geometry;
    },
    hasDetail(grid) { return geometries.has(`${ids.get(grid)}/detail`); },
    requestDetail(grid) { load(ids.get(grid), 'detail').catch((error) => loading.fail(error)); },
    async prepareAround(x, z) {
      const required = TERRAIN_MESHES.filter((grid) => grid.coarse && Math.hypot(x - (grid.minX + grid.maxX) / 2, z - (grid.minZ + grid.maxZ) / 2) < 6500);
      await Promise.all(required.map((grid) => load(ids.get(grid), 'detail')));
    }
  };
  const required = [];
  TERRAIN_MESHES.forEach((grid, id) => {
    if (grid.coarse) required.push([id, 'coarse']);
    if (!grid.coarse || Math.hypot(initialPosition.x - (grid.minX + grid.maxX) / 2, initialPosition.z - (grid.minZ + grid.maxZ) / 2) < 6500) required.push([id, 'detail']);
  });
  let next = 0;
  async function worker() {
    while (next < required.length) {
      const [id, level] = required[next++];
      await load(id, level);
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
}
