import { services } from './kazan-runtime.js';
import { prepareRegionalInstances } from './regional-instances.js';

export async function preparePower(initialPosition) {
  services.powerAssets = await prepareRegionalInstances('power', initialPosition, {
    centered: true, radii: [7500, 8500, 10000], castShadow: false, receiveShadow: false
  });
}
