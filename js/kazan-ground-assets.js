import { services } from './kazan-runtime.js';
import { loadPreparedWorld } from './prepared-world.js';

/** The existing ground maps arrive painted, including the distant road network. */
export async function prepareGround() {
  const world = await loadPreparedWorld();
  services.groundTextures = {};
  await Promise.all(world.entries.filter((entry) => entry.system === 'ground').map(async (entry) => {
    services.groundTextures[entry.id] = await world.loadTexture(entry);
  }));
}
