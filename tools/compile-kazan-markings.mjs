import { buildRoadNetwork } from '../js/road-network.js';
import { createRoadPaintGeometries } from '../js/road-paint-geometry.js';
import { trafficObstacleVersion } from '../js/traffic-obstacles.js';
import { collectTrafficObstacles } from './compile-kazan-traffic-inputs.mjs';

/** Bake the existing lane, stop-bar and crosswalk recipe against actual structural clearances. */
export async function compileMarkings({ writeGeometry }) {
  const obstacles = collectTrafficObstacles();
  const obstacleVersion = await trafficObstacleVersion(obstacles);
  const network = buildRoadNetwork([], obstacles);
  const geometries = createRoadPaintGeometries(network);
  for (const [id, geometry] of geometries) {
    await writeGeometry({ system: 'markings', id, surface: 'paint', obstacleVersion }, geometry);
    geometry.dispose();
  }
  console.log(`Compiled ${network.paintEdges.length} paint edges into ${geometries.size} marking regions`);
}
