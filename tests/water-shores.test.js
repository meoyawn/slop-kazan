import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, test } from 'node:test';
import * as THREE from 'three/webgpu';
import { createWaterSystem } from '../js/kazan-water.js';
import { runCityModule } from './helpers/module.js';

describe('Water meets the mapped shore', () => {
  test('cut land keeps island area and closes banks across spatial cell boundaries', () => {
    const water = createWaterSystem([{ id: 1, name: 'Pond', rings: [[250, 5, 270, 5, 270, 35, 250, 35]],
      holes: [[258, 18, 262, 18, 262, 22, 258, 22]] }], () => 20);
    const faces = [
      [[240, 0, 24], [280, 0, 24], [240, 40, 24]],
      [[280, 0, 24], [280, 40, 24], [240, 40, 24]]
    ].flatMap((triangle) => water.terrainFaces(triangle));
    let area = 0;
    for (const [a, b, c] of faces) {
      const signed = ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
      assert.ok(signed > 0, 'terrain retains its surface winding');
      area += signed;
      assert.equal(water.waterAt((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3), null,
        'no retained ground face covers the pond');
      for (const p of [a, b, c]) {
        if (p[0] > 240 && p[0] < 280 && p[1] > 0 && p[1] < 40) assert.equal(p[2], 20, 'outer and island bank edges meet the water');
      }
    }
    assert.ok(Math.abs(area - (1600 - 600 + 16)) < 1e-6, 'preserve exactly the land and the island');
    assert.equal(water.waterAt(260, 20), null, 'islands remain land');
    assert.equal(water.waterAt(260, 10).y, 20);
    assert.deepEqual(water.terrainFaces([[252, 8, 24], [254, 8, 24], [252, 10, 24]]), [], 'remove submerged terrain');
    assert.equal(water.terrainFaces([[220, 0, 24], [230, 0, 24], [220, 10, 24]]), null, 'ordinary terrain stays unchanged');
  });

  test('Black Lake and other inland lakes meet their land facets and walking surfaces', () => {
    const GEO = JSON.parse(gunzipSync(readFileSync(new URL('../js/kazan-geodata.json.gz', import.meta.url))));
    const context = { window: { NYC: { GEO } } };
    runCityModule(readFileSync(process.env.WATER_TEST_CONFIG || new URL('../js/kazan-config.js', import.meta.url), 'utf8'), context);
    const city = context.window.NYC;
    for (const id of [96239630, 6651756, 3974315]) {
      const body = (city.WATER_BODIES || GEO.water.map((body) => ({ ...body, y: 0 }))).find((body) => body.id === id);
      if (id === 96239630) assert.ok(body.y > 15 && body.y < 25, 'Black Lake water must be at its elevated bank, not the reservoir zero plane');
      const poly = city.toPoints(body.rings[0]), bounds = city.boundsOf(poly), positions = [];
      city.projectGroundPolygon([[bounds.minX - 20, bounds.minZ - 20, 0, 0], [bounds.maxX + 20, bounds.minZ - 20, 1, 0],
        [bounds.maxX + 20, bounds.maxZ + 20, 1, 1], [bounds.minX - 20, bounds.maxZ + 20, 0, 1]], (face) => {
        for (let i = 1; i + 1 < face.length; i++) for (const p of [face[0], face[i], face[i + 1]]) positions.push(p[0], p[4], p[1]);
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      mesh.updateMatrixWorld(true);
      let samples = 0;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length < 1) continue;
        const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2, nx = (b.z - a.z) / length, nz = (a.x - b.x) / length;
        const plus = city.waterAt(x + nx * 0.001, z + nz * 0.001), minus = city.waterAt(x - nx * 0.001, z - nz * 0.001);
        if (plus && minus) continue;
        const side = plus ? -1 : 1;
        const px = x + nx * side * 0.001, pz = z + nz * side * 0.001;
        const ray = new THREE.Raycaster(new THREE.Vector3(px, body.y + 100, pz), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(mesh)[0];
        assert.ok(hit, `${id}: the land reaches the mapped bank`);
        assert.ok(Math.abs(hit.point.y - body.y) < 0.12, `${id}/${i}: shore ${hit.point.y}, water ${body.y}, point ${px},${pz}`);
        assert.ok(Math.abs(city.roadHeight({ walk: true }, px, pz) - hit.point.y) < 0.002, 'bank paths follow the actual cut facets');
        assert.ok(Math.abs(city.surfaceHeight(px, pz, hit.point.y) - hit.point.y) < 0.06, 'walking reaches the same shoreline');
        samples++;
      }
      assert.ok(samples >= 6, 'sample all mapped shore segments');
      geometry.dispose(); mesh.material.dispose();
    }
  });
});
