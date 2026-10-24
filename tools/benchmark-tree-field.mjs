import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import * as THREE from 'three/webgpu';
import { createCanvas } from '@napi-rs/canvas';
import { installGeography } from '../js/kazan-runtime.js';
import { loadModule } from '../tests/helpers/module.js';

const baseline = process.argv[2];
if (!baseline) throw new Error('Usage: node tools/benchmark-tree-field.mjs /path/to/committed-trees.js');
installGeography(JSON.parse(gunzipSync(readFileSync(new URL('../js/kazan-geodata.json.gz', import.meta.url)))));
const config = await import('../js/kazan-config.js');
const source = readFileSync(new URL('../js/kazan-vegetation.js', import.meta.url), 'utf8');
const canvasDocument = { createElement: () => createCanvas(1, 1) };
function treeFactory(file) {
  return loadModule(readFileSync(file, 'utf8'), { imports: { 'three/webgpu': THREE,
    './tsl-materials.js': { createTreeMaterial: () => new THREE.MeshStandardNodeMaterial() } }, globals: { document: canvasDocument } }).createTreeField;
}
let sites;
const candidateFactory = treeFactory(new URL('../js/trees.js', import.meta.url));
const imports = {};
for (const match of source.matchAll(/^import .+ from '([^']+)';/gm)) {
  const specifier = match[1];
  imports[specifier] = specifier === 'three/webgpu' ? THREE : specifier === './trees.js' ? {
    createTreeField(scene, points, options) {
      const field = candidateFactory(scene, points, options), setSites = field.setSites;
      field.setSites = function(next) { sites = next; setSites(next); };
      return field;
    }
  } : await import(new URL(specifier, new URL('../js/kazan-vegetation.js', import.meta.url)));
}
const { createKazanVegetation } = loadModule(source, { imports, globals: { setTimeout, performance } });
const planting = createKazanVegetation(new THREE.Scene(), config.SPAWN);
while (!sites) await new Promise((resolve) => setTimeout(resolve, 10));
const camera = new THREE.Vector3(config.SPAWN.x, config.terrainHeight(config.SPAWN.x, config.SPAWN.z) + 20, config.SPAWN.z);
function inspect(factory) {
  const scene = new THREE.Scene(), start = performance.now(), field = factory(scene, sites, { capacity: 28000, canopyFill: 0.85 });
  field.update(camera); const constructionMs = performance.now() - start;
  let bytes = 0, draws = 0, instances = 0;
  const records = [], geometryKeys = new Map();
  field.group.traverse((mesh) => {
    if (!mesh.isInstancedMesh) return;
    bytes += mesh.instanceMatrix.array.byteLength + mesh.geometry.attributes.aTreeData.array.byteLength;
    if (!mesh.visible || !mesh.count) return;
    draws++; instances += mesh.count;
    const positions = mesh.geometry.attributes.position.array;
    if (!geometryKeys.has(positions)) geometryKeys.set(positions, createHash('sha256').update(new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength)).digest('hex'));
    for (let i = 0; i < mesh.count; i++) records.push([geometryKeys.get(positions), ...mesh.instanceMatrix.array.subarray(i * 16, i * 16 + 16),
      ...mesh.geometry.attributes.aTreeData.array.subarray(i * 4, i * 4 + 4)]);
  });
  records.sort((a, b) => a[13] - b[13] || a[15] - b[15]);
  return { bytes, draws, instances, constructionMs, digest: createHash('sha256').update(JSON.stringify(records)).digest('hex') };
}
const before = inspect(treeFactory(resolve(baseline))), after = inspect(candidateFactory);
assert.equal(after.digest, before.digest, 'all active geometry variants, Float32 transforms and foliage fields must match');
console.log(JSON.stringify({ kind: 'CPU allocation diagnostic; not a GPU/FPS benchmark', baseline: fileURLToPath(pathToFileURL(resolve(baseline))),
  planting: planting.group.userData.planting, camera: camera.toArray(), before, after, bufferReduction: 1 - after.bytes / before.bytes }, null, 2));
