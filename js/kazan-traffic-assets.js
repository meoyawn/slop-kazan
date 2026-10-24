import { services } from './kazan-runtime.js';
import { ROADS } from './kazan-config.js';
import { loadPreparedWorld } from './prepared-world.js';
import { trafficObstacleVersion } from './traffic-obstacles.js';
import { unpackTrafficTopology } from './traffic-topology.js';

/** Load compact static topology before traffic starts, then release the transported tables. */
export async function prepareTraffic() {
  const world = await loadPreparedWorld(), entry = world.entries.find((entry) => entry.system === 'traffic');
  if (!entry) throw new Error('Missing prepared traffic topology');
  let geometry = await world.loadGeometry(entry);
  services.trafficAssets = {
    async take(obstacles) {
      const current = geometry;
      if (!current) throw new Error('Prepared traffic topology was already consumed');
      geometry = null;
      try {
        if (entry.obstacleVersion !== await trafficObstacleVersion(obstacles)) {
          console.warn('Static traffic clearances changed; regenerating traffic topology');
          return null;
        }
        return unpackTrafficTopology(current, ROADS);
      } finally { current.dispose(); }
    }
  };
}
