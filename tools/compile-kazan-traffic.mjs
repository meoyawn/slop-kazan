import { ROADS } from '../js/kazan-config.js';
import { buildRoadNetwork } from '../js/road-network.js';
import { packTrafficTopology } from '../js/traffic-topology.js';
import { trafficObstacleVersion } from '../js/traffic-obstacles.js';
import { collectTrafficObstacles } from './compile-kazan-traffic-inputs.mjs';

/** Prepare lane connectivity and junction priorities; keep actor state and requested turn curves live. */
export async function compileTraffic({ writeGeometry }) {
  const obstacles = collectTrafficObstacles(), obstacleVersion = await trafficObstacleVersion(obstacles);
  const network = buildRoadNetwork([], obstacles, { paint: false });
  const geometry = packTrafficTopology(network, ROADS);
  await writeGeometry({ system: 'traffic', id: 'topology', obstacleVersion }, geometry);
  geometry.dispose();
  console.log(`Compiled ${network.nodes.length} traffic junctions and ${network.edges.length} directed edges`);
}
