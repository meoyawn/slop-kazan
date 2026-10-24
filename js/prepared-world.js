import { decodeGeometry } from './geometry-buffer.js';
import * as THREE from 'three/webgpu';

let prepared;

/** Shared transport for ahead-of-time city compilers. Content hashes identify immutable regions. */
export function loadPreparedWorld() {
  if (!prepared) prepared = readWorld();
  return prepared;
}

async function readWorld() {
  const base = new URL('compiled-world/', document.baseURI);
  const manifestFile = import.meta.env.PROD ? `manifest-${__KAZAN_WORLD_VERSION__}.json` : 'manifest.json';
  const response = await fetch(new URL(manifestFile, base), { cache: import.meta.env.PROD ? 'force-cache' : 'no-cache' });
  if (!response.ok) throw new Error(`Could not load prepared world: ${response.status}`);
  const manifest = await response.json();
  if (import.meta.env.PROD && manifest.version !== __KAZAN_WORLD_VERSION__) throw new Error('Prepared world does not match this release');
  if (manifest.geography !== __KAZAN_GEODATA_VERSION__) throw new Error('Prepared world does not match the map');
  const pending = new Map();
  async function loadGeometry(entry) {
    if (pending.has(entry.file)) return pending.get(entry.file);
    async function download() {
      const response = await fetch(new URL(entry.file, base));
      if (!response.ok) throw new Error(`Could not load world region: ${response.status}`);
      let buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (bytes[0] === 31 && bytes[1] === 139) buffer = await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      if (buffer.byteLength !== entry.bytes) throw new Error(`Truncated world region ${entry.system}/${entry.id}`);
      return decodeGeometry(buffer);
    }
    const task = download().finally(() => pending.delete(entry.file));
    pending.set(entry.file, task);
    return task;
  }
  async function loadTexture(entry) {
    const response = await fetch(new URL(entry.file, base));
    if (!response.ok) throw new Error(`Could not load ground atlas: ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob());
    const texture = new THREE.Texture(bitmap);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }
  return { entries: manifest.entries, loadGeometry, loadTexture };
}
