import * as THREE from 'three/webgpu';
import { ROADS } from '../js/kazan-config.js';
import { createRoadGeometry } from '../js/kazan-road-geometry.js';

/** Partition exact road triangles into streamable cells; retain elevated decks at every distance. */
export async function compileRoads({ writeGeometry }) {
  const batches = new Map();
  function grow(array, length) {
    if (array.length >= length) return array;
    const next = new array.constructor(Math.max(length, array.length * 2));
    next.set(array);
    return next;
  }
  function append(road, width, offset, surface, innerWidth = 0) {
    const geometry = createRoadGeometry(road, width, offset, innerWidth);
    if (!geometry) return;
    const p = geometry.attributes.position, n = geometry.attributes.normal, uv = geometry.attributes.uv, index = geometry.index.array;
    const elevated = Boolean(road.bridge || road.tunnel || road.kind === 'steps'), remaps = new Map();
    for (let i = 0; i < index.length; i += 3) {
      const a = index[i], b = index[i + 1], c = index[i + 2];
      const cell = `${Math.floor((p.getX(a) + p.getX(b) + p.getX(c)) / 3072)},${Math.floor((p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3072)}`;
      const key = `${surface}/${elevated}/${cell}`;
      if (!batches.has(key)) batches.set(key, { cell, surface, elevated, count: 0, indexCount: 0,
        position: new Float32Array(3072), normal: new Float32Array(3072), uv: new Float32Array(2048), index: new Uint32Array(2048) });
      const batch = batches.get(key);
      if (!remaps.has(key)) remaps.set(key, new Map());
      const ids = remaps.get(key);
      batch.index = grow(batch.index, batch.indexCount + 3);
      for (const id of [a, b, c]) {
        if (!ids.has(id)) {
          const next = batch.count++;
          batch.position = grow(batch.position, batch.count * 3);
          batch.normal = grow(batch.normal, batch.count * 3);
          batch.uv = grow(batch.uv, batch.count * 2);
          batch.position.set(p.array.subarray(id * 3, id * 3 + 3), next * 3);
          batch.normal.set(n.array.subarray(id * 3, id * 3 + 3), next * 3);
          batch.uv.set(uv.array.subarray(id * 2, id * 2 + 2), next * 2);
          ids.set(id, next);
        }
        batch.index[batch.indexCount++] = ids.get(id);
      }
    }
    geometry.dispose();
  }
  for (const road of ROADS) {
    if (road.pedestrianStructure) continue;
    if (road.parking) append(road, road.w, 0.09, 'asphalt');
    else if (road.kind === 'steps' && road.campus) continue;
    else if (road.campusAccess || road.walk) append(road, road.w, 0.055, 'pavement');
    else {
      append(road, road.w + (road.bridge ? 2 : 5), 0.045, 'pavement', road.w);
      append(road, road.w, 0.065, 'asphalt');
    }
  }
  for (const batch of batches.values()) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(batch.position.subarray(0, batch.count * 3), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(batch.normal.subarray(0, batch.count * 3), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(batch.uv.subarray(0, batch.count * 2), 2));
    const Type = batch.count < 65535 ? Uint16Array : Uint32Array;
    geometry.setIndex(new THREE.BufferAttribute(new Type(batch.index.subarray(0, batch.indexCount)), 1));
    await writeGeometry({ system: 'roads', id: batch.cell, surface: batch.surface, elevated: batch.elevated }, geometry);
    geometry.dispose();
  }
  console.log(`Compiled ${ROADS.length} mapped roads into ${batches.size} regional surfaces`);
}
