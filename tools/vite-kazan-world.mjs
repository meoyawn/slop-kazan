import { existsSync, readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { prepareWorld } from './build-kazan-world.mjs';

/** Prepared city regions enter the same hashed asset graph as Vite's other release assets. */
export function kazanWorld() {
  const output = new URL('../.cache/compiled-world/current/', import.meta.url);
  const moduleId = 'virtual:kazan-world', resolvedId = '\0' + moduleId;
  let development, world;
  return {
    name: 'kazan-prepared-world',
    configResolved(config) { development = config.command === 'serve'; },
    async buildStart() {
      const manifest = new URL('manifest.json', output);
      world = development && existsSync(manifest) ? JSON.parse(readFileSync(manifest)) : await prepareWorld();
    },
    resolveId(id) { if (id === moduleId) return resolvedId; },
    load(id) {
      if (id !== resolvedId) return;
      if (development) return 'export const manifestUrl = "/.cache/compiled-world/current/manifest.json"; export const worldVersion = null;';
      const entries = world.entries.map((entry) => {
        const extension = entry.file.endsWith('.bin.gz') ? '.bin.gz' : extname(entry.file);
        const reference = this.emitFile({ type: 'asset', name: `kazan-${entry.system}${extension}`, source: readFileSync(new URL(entry.file, output)) });
        return { ...entry, file: basename(this.getFileName(reference)) };
      });
      const reference = this.emitFile({ type: 'asset', name: 'kazan-world.json', source: JSON.stringify({ ...world, entries }) });
      return `export const manifestUrl = import.meta.ROLLUP_FILE_URL_${reference}; export const worldVersion = ${JSON.stringify(world.version)};`;
    }
  };
}
