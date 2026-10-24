import { services } from './kazan-runtime.js';
import { prepareRegionalInstances } from './regional-instances.js';

/** Both rail networks use the same regional repeated-part transport and retain separate live topology. */
export async function prepareRailways(initialPosition) {
  const [rail, tram] = await Promise.all(['rail', 'tram'].map((system) => prepareRegionalInstances(system, initialPosition)));
  services.railAssets = { KazanRailways: rail, KazanTramTracks: tram };
}
