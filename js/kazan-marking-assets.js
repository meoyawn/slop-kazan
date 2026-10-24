import * as THREE from 'three/webgpu';
import { services } from './kazan-runtime.js';
import { prepareRegionalSurfaces } from './regional-surfaces.js';
import { loadPreparedWorld } from './prepared-world.js';
import { trafficObstacleVersion } from './traffic-obstacles.js';
import { createRoadPaintMaterial } from './tsl-materials.js';
import { buildRoadPaint } from './road-paint.js';
import { buildRoadNetwork } from './road-network.js';

/** Markings share road residency while preserving dash phase, road heights and local structure clearances. */
export async function prepareMarkings(initialPosition) {
  const world = await loadPreparedWorld();
  const regions = await prepareRegionalSurfaces('markings', initialPosition);
  let usePrepared = true;
  services.markingAssets = {
    prepareAround: regions.prepareAround,
    update(x, z) { if (usePrepared) regions.update(x, z); },
    async attach(scene, sidewalks, obstacles) {
      const expected = world.entries.find((entry) => entry.system === 'markings')?.obstacleVersion;
      usePrepared = expected === await trafficObstacleVersion(obstacles);
      if (!usePrepared) {
        console.warn('Static traffic clearances changed; regenerating road markings');
        buildRoadPaint(scene, buildRoadNetwork(sidewalks, obstacles));
        return;
      }
      const group = new THREE.Group(); group.name = 'RoadMarkings';
      regions.attach(group, { paint: createRoadPaintMaterial() }, { renderOrder: -1 });
      scene.add(group);
    }
  };
}
