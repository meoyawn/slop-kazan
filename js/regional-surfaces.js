import * as THREE from 'three/webgpu';
import { services } from './kazan-runtime.js';
import { loadPreparedWorld } from './prepared-world.js';

const DETAIL_DISTANCE = 3500, PREFETCH_DISTANCE = 5500, RETAIN_DISTANCE = 9000;

function distance(entry, x, z) {
  const [minX, minZ, maxX, maxZ] = entry.bounds;
  return Math.hypot(Math.max(minX - x, 0, x - maxX), Math.max(minZ - z, 0, z - maxZ));
}

/** Spatial surfaces keep ownership and residency independent of their shared procedural materials. */
export async function prepareRegionalSurfaces(system, initialPosition) {
  const world = await loadPreparedWorld();
  const records = world.entries.filter((entry) => entry.system === system).map((entry) => ({ entry, geometry: null, owner: null, pending: null, retryAt: 0 }));
  let group, materials, meshOptions = {}, x = initialPosition.x, z = initialPosition.z, stamp = '', running = 0;
  function mount(record) {
    if (!group || record.owner || !record.geometry) return;
    record.owner = new THREE.Group();
    record.owner.name = `${system}Region/${record.entry.id}`;
    const mesh = new THREE.Mesh(record.geometry, materials[record.entry.surface]);
    mesh.matrixAutoUpdate = mesh.matrixWorldAutoUpdate = false;
    mesh.receiveShadow = true;
    mesh.renderOrder = meshOptions.renderOrder || 0;
    record.owner.add(mesh);
    group.add(record.owner);
  }
  async function load(record) {
    if (record.geometry) return;
    if (record.pending) return record.pending;
    async function download() {
      record.geometry = await world.loadGeometry(record.entry);
      if (record.entry.elevated || distance(record.entry, x, z) < DETAIL_DISTANCE) mount(record);
    }
    record.pending = download().finally(() => { record.pending = null; });
    return record.pending;
  }
  async function prepareAround(px, pz) {
    const required = records.filter((record) => record.entry.elevated || distance(record.entry, px, pz) < DETAIL_DISTANCE);
    let next = 0;
    async function worker() { while (next < required.length) await load(required[next++]); }
    await Promise.all(Array.from({ length: 6 }, worker));
  }
  function prefetch() {
    if (!services.worldReady) return;
    const candidates = records.filter((record) => !record.geometry && !record.pending && record.retryAt <= performance.now() && distance(record.entry, x, z) < PREFETCH_DISTANCE)
      .sort((a, b) => distance(a.entry, x, z) - distance(b.entry, x, z));
    while (running < 4 && candidates.length) {
      const record = candidates.shift();
      running++;
      load(record).catch((error) => { record.retryAt = performance.now() + 5000; console.warn(`${system} region download failed`, error); })
        .finally(() => { running--; stamp = ''; });
    }
  }
  const assets = {
    attach(parent, palette, options = {}) {
      group = parent; materials = palette; meshOptions = options;
      for (const record of records) if (record.geometry) mount(record);
    },
    prepareAround,
    update(px, pz) {
      x = px; z = pz;
      const next = `${Math.floor(x / 128)},${Math.floor(z / 128)}/${Boolean(services.worldReady)}`;
      if (next === stamp) return;
      stamp = next;
      for (const record of records) {
        const d = record.entry.elevated ? 0 : distance(record.entry, x, z);
        if (d > RETAIN_DISTANCE && record.geometry) {
          record.owner?.removeFromParent();
          record.geometry.dispose(); record.geometry = record.owner = null;
        } else if (record.geometry) {
          if (d < DETAIL_DISTANCE) mount(record);
          if (record.owner) record.owner.visible = d < DETAIL_DISTANCE;
        }
      }
      prefetch();
    }
  };
  await prepareAround(x, z);
  return assets;
}
