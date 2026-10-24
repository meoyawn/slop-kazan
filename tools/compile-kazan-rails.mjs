import { GEO } from '../js/kazan-runtime.js';
import { createKazanRailways, createRailwayPaths } from '../js/kazan-railways.js';
import '../js/kazan-trams.js';
import { createInstanceCompiler } from './compile-kazan-instances.mjs';

/** Rail beds and near equipment share the runtime recipe; moving vehicles stay live. */
export async function compileRails({ writeGeometry }) {
  for (const [system, source] of [['rail', GEO.railways], ['tram', GEO.trams]]) {
    const compiler = createInstanceCompiler(system);
    createKazanRailways(compiler.draw, createRailwayPaths(source), 'PreparedRailParts', { precomputeDetails: true });
    await compiler.write(writeGeometry);
  }
}
