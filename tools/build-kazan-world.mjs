import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { installGeography } from '../js/kazan-runtime.js';
import { encodeGeometry } from './encode-geometry.mjs';

const root = new URL('../', import.meta.url), output = new URL('../public/compiled-world/', import.meta.url);
const compressed = readFileSync(new URL('js/kazan-geodata.json.gz', root));
const geography = createHash('sha256').update(compressed).digest('hex').slice(0, 16);
const hash = createHash('sha256').update(compressed).update(readFileSync(new URL('package.json', root)));
for (const file of readdirSync(new URL('js/', root)).filter((name) => name.endsWith('.js')).sort()) hash.update(file).update(readFileSync(new URL(`js/${file}`, root)));
for (const file of readdirSync(new URL('tools/', root)).filter((name) => /^(?:build-kazan-world|compile-kazan-.+|kazan-ground-canvas|encode-geometry)\.mjs$/.test(name)).sort()) hash.update(file).update(readFileSync(new URL(`tools/${file}`, root)));
const version = hash.digest('hex').slice(0, 16), manifestURL = new URL('manifest.json', output);
if (existsSync(manifestURL)) {
  const previous = JSON.parse(readFileSync(manifestURL));
  if (previous.version === version && previous.entries.every((entry) => existsSync(new URL(entry.file, output)))) {
    console.log(`World buffers unchanged: ${previous.entries.length} assets, ${(previous.compressedBytes / 1048576).toFixed(2)} MB compressed`);
    process.exit(0);
  }
}

installGeography(JSON.parse(gunzipSync(compressed)));
const { compileTerrain } = await import('./compile-kazan-terrain.mjs');
const { compileRoads } = await import('./compile-kazan-roads.mjs');
const { compileGround } = await import('./compile-kazan-ground.mjs');
mkdirSync(output, { recursive: true });
const entries = [];
let rawBytes = 0, compressedBytes = 0;
async function writeAsset(descriptor, buffer, extension) {
  const file = `${createHash('sha256').update(buffer).digest('hex').slice(0, 24)}.${extension}`;
  if (buffer.length > 24 * 1048576) throw new Error(`Prepared region exceeds the Pages asset limit: ${descriptor.system}/${descriptor.id}`);
  if (!existsSync(new URL(file, output))) writeFileSync(new URL(file, output), buffer);
  return file;
}
async function writeGeometry(descriptor, geometry) {
  const buffer = Buffer.from(await encodeGeometry(geometry));
  const packed = gzipSync(buffer, { level: 9 });
  const file = await writeAsset(descriptor, packed, 'bin.gz');
  const b = geometry.boundingBox;
  entries.push({ ...descriptor, file, bytes: buffer.length, compressedBytes: packed.length,
    bounds: [b.min.x, b.min.z, b.max.x, b.max.z] });
  rawBytes += buffer.length; compressedBytes += packed.length;
}
async function writeImage(descriptor, buffer, format) {
  const file = await writeAsset(descriptor, buffer, format);
  entries.push({ ...descriptor, file, bytes: buffer.length, compressedBytes: buffer.length });
  rawBytes += buffer.length; compressedBytes += buffer.length;
}
const compilers = [compileTerrain, compileRoads, compileGround];
for (const compile of compilers) await compile({ writeGeometry, writeImage });
writeFileSync(new URL('manifest.next.json', output), JSON.stringify({ version, geography, rawBytes, compressedBytes, entries }));
renameSync(new URL('manifest.next.json', output), manifestURL);
writeFileSync(new URL(`manifest-${version}.json`, output), readFileSync(manifestURL));
const retained = new Set(entries.map((entry) => entry.file));
const archive = new URL('../.cache/compiled-world/', import.meta.url);
for (const file of readdirSync(output)) {
  if (!/^[a-f0-9]{24}\.(?:bin\.gz|png|webp)$/.test(file) || retained.has(file)) continue;
  mkdirSync(archive, { recursive: true });
  renameSync(new URL(file, output), new URL(file, archive));
}
console.log(`Compiled ${entries.length} world assets: ${(rawBytes / 1048576).toFixed(2)} MB encoded, ${(compressedBytes / 1048576).toFixed(2)} MB compressed`);
