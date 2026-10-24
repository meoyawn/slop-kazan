import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three/webgpu';
import { loadModule } from './helpers/module.js';
import { compilePower as compileSource } from '../tools/kazan-power.mjs';
import { createInstanceCompiler } from '../tools/compile-kazan-instances.mjs';
import { encodeGeometry } from '../tools/encode-geometry.mjs';
import { decodeGeometry } from '../js/geometry-buffer.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('prepared power retains sloping pole caps and bundled conductors through eviction and return', async () => {
  const source = [];
  for (const [offset, first] of [[0, 1], [20000, 3]]) {
    for (let i = 0; i < 2; i++) source.push({ type: 'node', id: first + i, lon: offset + i * 80, lat: 0,
      tags: { power: 'pole', height: '20', material: 'wood' } });
    source.push({ type: 'way', id: first + 10, nodes: [first, first + 1],
      geometry: [{ lon: offset, lat: 0 }, { lon: offset + 80, lat: 0 }],
      tags: { power: 'minor_line', voltage: '10000', cables: '3', wires: 'double' } });
  }
  const power = compileSource(source, { toWorld: ({ lon, lat }) => [lon, lat], clipRoad: (pts, nodes) => [{ pts, nodes }], closedRing: () => [], joinMembers: () => [] });
  const services = {}, ground = (x) => x * 0.01;
  const { createKazanPowerLines } = loadModule(read('../js/kazan-power-lines.js'), { imports: {
    'three/webgpu': THREE, './kazan-runtime.js': { GEO: { power }, runtime: {}, services },
    './kazan-config.js': { groundSurfaceHeight: ground, surfaceHeight: ground },
    './kazan-railways.js': { nearestRailway: () => null }, './kazan-trams.js': { nearestTram: () => null }
  } });
  const { compilePower } = loadModule(read('../tools/compile-kazan-power.mjs'), { imports: {
    '../js/kazan-power-lines.js': { createKazanPowerLines }, './compile-kazan-instances.mjs': { createInstanceCompiler }
  } });
  const entries = [], payloads = new Map(), disposed = [];
  await compilePower({ async writeGeometry(entry, geometry) {
    const box = geometry.boundingBox;
    entries.push({ ...entry, bounds: [box.min.x, box.min.z, box.max.x, box.max.z] });
    payloads.set(entry.id, await encodeGeometry(geometry));
  } });
  const { prepareRegionalInstances } = loadModule(read('../js/regional-instances.js'), { imports: {
    'three/webgpu': THREE, './kazan-runtime.js': { services },
    './prepared-world.js': { async loadPreparedWorld() { return { entries, async loadGeometry(entry) {
      const geometry = await decodeGeometry(payloads.get(entry.id));
      geometry.addEventListener('dispose', () => disposed.push(entry.id)); return geometry;
    } }; } }
  } });
  services.powerAssets = await prepareRegionalInstances('power', { x: 0, z: 0 }, {
    centered: true, radii: [7500, 8500, 10000], castShadow: false, receiveShadow: false
  });
  const { group, update } = createKazanPowerLines({ plainMaterial: (color, metalness) => new THREE.MeshStandardNodeMaterial({ color, metalness }), buildingCollider: () => null });
  function cap(x) {
    group.updateMatrixWorld(true);
    const meshes = []; group.traverseVisible((object) => { if (object.isMesh) meshes.push(object); });
    return new THREE.Raycaster(new THREE.Vector3(x, ground(x) + 30, 0), new THREE.Vector3(0, -1, 0)).intersectObjects(meshes, false)[0]?.point.y;
  }
  function conductor(x, y, z) {
    let found = false;
    group.traverseVisible((object) => {
      if (!object.isLineSegments) return;
      const p = object.geometry.attributes.position;
      for (let i = object.geometry.drawRange.start; i < object.geometry.drawRange.start + object.geometry.drawRange.count; i++) {
        if (Math.abs(p.getX(i) - x) < 0.00001 && Math.abs(p.getY(i) - y) < 0.00001 && Math.abs(p.getZ(i) - z) < 0.00001) found = true;
      }
    });
    return found;
  }
  assert.ok(Math.abs(cap(0) - 22) < 0.00001, String(cap(0)));
  assert.ok(Math.abs(cap(80) - 22.8) < 0.00001, String(cap(80)));
  assert.ok(conductor(0, 19.3, -0.62), 'the first bundled wire remains attached to the explicit pole height');
  const wire = group.children.flatMap((owner) => owner.children).find((object) => object.isLineSegments);
  let wireReleased = false; wire.geometry.addEventListener('dispose', () => { wireReleased = true; });
  update(512 + 7500, 512);
  assert.equal(cap(0), undefined, 'visibility uses the original strict cell-centre radius');
  await services.powerAssets.prepareAround(20000, 0); update(20000, 0);
  assert.ok(Math.abs(cap(20000) - 222) < 0.00001, String(cap(20000)));
  assert.ok(conductor(20000, 219.3, -0.62));
  assert.ok(wireReleased && disposed.length, 'travel releases both conductor geometry and transport storage');
  assert.equal(cap(0), undefined);
  await services.powerAssets.prepareAround(0, 0); update(0, 0);
  assert.ok(Math.abs(cap(0) - 22) < 0.00001, String(cap(0)));
  assert.ok(conductor(0, 19.3, -0.62));
});
