import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import * as THREE from 'three/webgpu';
import { createGroundOpenings } from '../js/kazan-ground-openings.js';

describe('Underground entrance openings', () => {
  test('overlapping and rotated stairwell holes remove the lid while retaining the surrounding slope and UVs', () => {
    const a = Math.SQRT1_2;
    for (const [rings, expectedArea] of [
      [[[-1, -3, 1, -3, 1, 3, -1, 3], [0, 3, 2, 3, 2, -3, 0, -3]], 82],
      [[[2 * a, -4 * a, 4 * a, -2 * a, -2 * a, 4 * a, -4 * a, 2 * a]], 88]
    ]) {
      const geometry = new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2), p = geometry.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, p.getX(i) * 0.2 + p.getZ(i) * 0.1);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); mesh.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, -1, 0));
      assert.ok(ray.intersectObject(mesh).length, 'the uncut terrain actually covers the stairwell');
      const openings = createGroundOpenings(rings); openings.cutGeometry(geometry); geometry.computeVertexNormals();
      assert.equal(ray.intersectObject(mesh).length, 0, 'the stairwell has a physical opening through the terrain');
      const positions = geometry.attributes.position, uv = geometry.attributes.uv, index = geometry.index;
      let area = 0;
      for (let i = 0; i < index.count; i += 3) {
        const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
        const [a, b, c] = ids.map((id) => [positions.getX(id), positions.getZ(id)]);
        area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
        for (const id of ids) {
          const x = positions.getX(id), z = positions.getZ(id);
          assert.ok(Math.abs(positions.getY(id) - x * 0.2 - z * 0.1) < 1e-6, 'cut vertices retain the terrain plane');
          assert.ok(Math.abs(uv.getX(id) - (x / 10 + 0.5)) < 1e-6);
          assert.ok(Math.abs(uv.getY(id) - (0.5 - z / 10)) < 1e-6);
        }
      }
      assert.ok(Math.abs(area - expectedArea) < 1e-4, 'retain exactly the terrain outside the union of openings');
      const outside = new THREE.Raycaster(new THREE.Vector3(-4, 5, 0), new THREE.Vector3(0, -1, 0)).intersectObject(mesh)[0];
      assert.ok(outside && Math.abs(outside.point.y + 0.8) < 1e-6, 'surrounding ground remains solid at its original height');
    }
  });
});
