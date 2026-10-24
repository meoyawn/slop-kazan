import * as THREE from 'three/webgpu';
import { services } from './kazan-runtime.js';
import { loadPreparedWorld } from './prepared-world.js';

function distance(entry, x, z, centered) {
  if (centered) return Math.min(...entry.centers.map(([cx, cz]) => Math.hypot(cx - x, cz - z)));
  if (entry.level === 'structure') return 0;
  if (entry.level === 'detail') return Math.min(...entry.centers.map(([cx, cz]) => Math.hypot(cx - x, cz - z)));
  const [minX, minZ, maxX, maxZ] = entry.bounds;
  return Math.hypot(Math.max(minX - x, 0, x - maxX), Math.max(minZ - z, 0, z - maxZ));
}

const visibleDistance = (entry) => entry.level === 'detail' ? 1200 : 3500;
const prefetchDistance = (entry) => entry.level === 'detail' ? 1500 : 5500;
const retainDistance = (entry) => entry.level === 'detail' ? 1800 : 9000;

/** Static part families share decoded storage; local equipment keeps its original owner and visibility radius. */
export async function prepareRegionalInstances(system, initialPosition, profile = {}) {
  const world = await loadPreparedWorld();
  const records = world.entries.filter((entry) => entry.system === system).map((entry) => ({ entry, data: null, owner: null, pending: null, preparing: 0, retryAt: 0 }));
  if (!records.length) throw new Error(`Prepared world is missing ${system} parts`);
  let group, plainMaterial, x = initialPosition.x, z = initialPosition.z, stamp = '', running = 0;
  const lines = new Map();
  const range = (entry) => distance(entry, x, z, profile.centered);
  const visible = (entry) => profile.radii?.[0] ?? visibleDistance(entry);
  const prefetchRadius = (entry) => profile.radii?.[1] ?? prefetchDistance(entry);
  const retain = (entry) => profile.radii?.[2] ?? retainDistance(entry);

  function mount(record) {
    if (!group || record.owner || !record.data) return;
    const transforms = record.data.attributes.transform, colours = record.data.attributes.color;
    const batches = record.data.userData.batches;
    if (!transforms || !colours || !Array.isArray(batches)) throw new Error(`Invalid prepared instances: ${system}/${record.entry.id}`);
    const owner = new THREE.Group(); owner.name = `${system}Parts/${record.entry.id}`;
    for (const batch of batches) {
      if (!Number.isSafeInteger(batch.start) || !Number.isSafeInteger(batch.count) || batch.start < 0 || batch.count < 0 ||
          batch.start + batch.count > transforms.count || batch.start + batch.count > colours.count) throw new Error('Invalid prepared instance range');
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), plainMaterial(0xffffff, batch.metalness), 0);
      mesh.name = 'PreparedStaticParts';
      mesh.instanceMatrix = new THREE.StorageInstancedBufferAttribute(transforms.array.subarray(batch.start * 16, (batch.start + batch.count) * 16), 16);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(colours.array.subarray(batch.start * 3, (batch.start + batch.count) * 3), 3);
      mesh.count = batch.count;
      mesh.matrixAutoUpdate = mesh.matrixWorldAutoUpdate = false;
      mesh.castShadow = profile.castShadow ?? true;
      mesh.receiveShadow = profile.receiveShadow ?? true;
      mesh.boundingBox = new THREE.Box3(new THREE.Vector3(...batch.bounds[0]), new THREE.Vector3(...batch.bounds[1]));
      mesh.boundingSphere = mesh.boundingBox.getBoundingSphere(new THREE.Sphere());
      mesh.userData.regionCenter = batch.center;
      owner.add(mesh);
    }
    for (const line of record.data.userData.lines || []) {
      const position = record.data.attributes.position;
      if (!position || !Number.isSafeInteger(line.start) || !Number.isSafeInteger(line.count) || line.start < 0 || line.count < 0 ||
          line.start + line.count > position.count || line.count % 2) throw new Error('Invalid prepared line range');
      if (!lines.has(line.colour)) lines.set(line.colour, new THREE.LineBasicNodeMaterial({ color: line.colour }));
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', position); geometry.setDrawRange(line.start, line.count);
      geometry.boundingBox = record.data.boundingBox; geometry.boundingSphere = record.data.boundingSphere;
      const mesh = new THREE.LineSegments(geometry, lines.get(line.colour));
      mesh.name = 'PreparedStaticLines'; mesh.matrixAutoUpdate = mesh.matrixWorldAutoUpdate = false;
      owner.add(mesh);
    }
    record.owner = owner; group.add(owner);
  }
  function apply(record) {
    const d = range(record.entry);
    if (!record.preparing && d > retain(record.entry) && record.data) {
      record.owner?.removeFromParent();
      record.owner?.traverse((object) => {
        if (object.isMesh || object.isLineSegments) { object.geometry.dispose(); object.dispose?.(); }
      });
      record.data.dispose(); record.data = record.owner = null;
      return;
    }
    if (d < visible(record.entry)) mount(record);
    if (!record.owner) return;
    record.owner.visible = d < visible(record.entry);
    if (record.entry.level === 'detail') for (const mesh of record.owner.children) {
      const [cx, cz] = mesh.userData.regionCenter;
      mesh.visible = Math.hypot(cx - x, cz - z) < 1200;
    }
  }
  async function load(record) {
    if (record.data) return;
    if (record.pending) return record.pending;
    async function download() {
      record.data = await world.loadGeometry(record.entry);
      stamp = ''; apply(record);
    }
    record.pending = download().finally(() => { record.pending = null; });
    return record.pending;
  }
  async function prepareAround(px, pz) {
    const required = records.filter((record) => distance(record.entry, px, pz, profile.centered) < visible(record.entry));
    for (const record of required) record.preparing++;
    let next = 0;
    async function worker() { while (next < required.length) await load(required[next++]); }
    try { await Promise.all(Array.from({ length: 6 }, worker)); }
    finally { for (const record of required) record.preparing--; stamp = ''; }
  }
  function prefetch() {
    if (!services.worldReady) return;
    const candidates = records.filter((record) => !record.data && !record.pending && record.retryAt <= performance.now() &&
      range(record.entry) < prefetchRadius(record.entry))
      .sort((a, b) => range(a.entry) - range(b.entry));
    while (running < 4 && candidates.length) {
      const record = candidates.shift(); running++;
      load(record).catch((error) => { record.retryAt = performance.now() + 5000; console.warn(`${system} parts download failed`, error); })
        .finally(() => { running--; stamp = ''; });
    }
  }
  const assets = {
    attach(parent, materialFactory) {
      group = parent; plainMaterial = materialFactory;
      for (const record of records) apply(record);
    },
    prepareAround,
    update(px, pz) {
      x = px; z = pz;
      const next = `${Math.floor(x / 128)},${Math.floor(z / 128)}/${Boolean(services.worldReady)}`;
      if (next === stamp) return;
      stamp = next;
      for (const record of records) apply(record);
      prefetch();
    }
  };
  await prepareAround(x, z);
  return assets;
}
