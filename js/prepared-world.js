import { decodeGeometry } from './geometry-buffer.js';
import { GEO_DATA_VERSION } from './kazan-geodata.js';
import * as THREE from 'three/webgpu';
import { manifestUrl, worldVersion } from 'virtual:kazan-world';

let prepared;

/** Shared transport for ahead-of-time city compilers. Content hashes identify immutable regions. */
export function loadPreparedWorld() {
  if (!prepared) prepared = readWorld();
  return prepared;
}

async function readWorld() {
  const manifestURL = new URL(manifestUrl, document.baseURI), base = new URL('.', manifestURL);
  const response = await fetch(manifestURL, { cache: import.meta.env.PROD ? 'force-cache' : 'no-cache' });
  if (!response.ok) throw new Error(`Could not load prepared world: ${response.status}`);
  const manifest = await response.json();
  if (import.meta.env.PROD && manifest.version !== worldVersion) throw new Error('Prepared world does not match this release');
  if (manifest.geography !== GEO_DATA_VERSION) throw new Error('Prepared world does not match the map');
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
