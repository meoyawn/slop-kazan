import { services } from './kazan-runtime.js';
import { prepareRegionalSurfaces } from './regional-surfaces.js';

/** Exact local roads stream over a compact distant ground atlas; decks remain present citywide. */
export async function prepareRoads(initialPosition) {
  services.roadAssets = await prepareRegionalSurfaces('roads', initialPosition);
}
