import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';
import * as THREE from 'three/webgpu';

const require = createRequire(import.meta.url);
const { loadModule } = require('./helpers/module.cjs');

describe('Terrain-following road markings', () => {
  test('sloped markings retain their coverage and continuous dash phase across spatial cells', () => {
    function height(x, z) { return 2 + x * 0.01 + z * 0.03 + Math.abs(x - 1020) * 0.02; }
    const { buildRoadPaint } = loadModule(readFileSync(new URL('../js/road-paint.js', import.meta.url), 'utf8'), {
      imports: {
        'three/webgpu': THREE,
        './road-network.js': { CROSSWALK: 3 },
        './tsl-materials.js': { createRoadPaintMaterial() { return new THREE.MeshBasicNodeMaterial(); } },
        './kazan-runtime.js': { runtime: {} },
        './kazan-config.js': { roadHeight(road, x, z) { return height(x, z); } }
      }
    });
    const edges = [900, 2000].map((sx, id) => ({
      sx, sz: 0, x0: sx, z0: 0, dx: 1, dz: 0, rx: 0, rz: 1,
      len: 240, span: 240, half: 8, axis: 'street', lanes: [2, 5],
      from: { id: id * 2, shape: true }, to: { id: id * 2 + 1, shape: true }, road: {}
    }));
    const mesh = buildRoadPaint(new THREE.Scene(), { edges });
    mesh.updateMatrixWorld(true);
    for (const edge of edges) for (let s = 1; s < 239; s += 7.25) {
      const x = edge.sx + s, z = 3.5;
      const ray = new THREE.Raycaster(new THREE.Vector3(x, 200, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(mesh)[0];
      assert.ok(hit, `retained road marking at ${x}, ${z}`);
      assert.ok(Math.abs(hit.point.y - height(x, z) - 0.082) < 0.0011, 'paint remains on the road across changes of slope');
      const { a, b, c } = hit.face;
      const barycentric = new THREE.Triangle().setFromAttributeAndIndices(mesh.geometry.attributes.position, a, b, c)
        .getBarycoord(hit.point, new THREE.Vector3());
      const paint = mesh.geometry.attributes.paint;
      const phase = paint.getX(a) * barycentric.x + paint.getX(b) * barycentric.y + paint.getX(c) * barycentric.z;
      assert.ok(Math.abs(phase - (s - 0.9)) < 0.001, 'spatial partitioning does not restart the dash phase');
    }
  });
});
