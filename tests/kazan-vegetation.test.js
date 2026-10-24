import { runCityModule } from './helpers/module.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(process.env.VEGETATION_TEST_SOURCE || join(import.meta.dirname, '../js/kazan-vegetation.js'), 'utf8');

/** The renderer consumes the generated sites; the fixture leaves their selection to production code. */
function plantingWorld() {
  const tasks = [];
  function Group() { this.children = []; this.userData = {}; }
  Group.prototype.add = function (object) { this.children.push(object); };
  function Vector3(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  Vector3.prototype.set = function (x, y, z) { this.x = x; this.y = y; this.z = z; return this; };
  function Matrix4() {}
  Matrix4.prototype.compose = function () { return this; };
  function Color() {}
  Color.prototype.setHex = function () { return this; };
  function InstancedMesh() { this.userData = {}; this.instanceMatrix = {}; }
  InstancedMesh.prototype.setMatrixAt = function () {};
  InstancedMesh.prototype.setColorAt = function () {};
  InstancedMesh.prototype.computeBoundingSphere = function () {};
  function resource() {}
  const treeField = { group: new Group(), stats: { trees: 0 }, sites: [], update() {},
    canopyRadius() { return 10; },
    setSites(sites) { this.sites = Array.from(sites, (p) => ({ ...p })); this.stats.trees = sites.length; } };
  const city = { THREE: { Group, Vector3, Matrix4, Color, InstancedMesh, Quaternion: resource,
    IcosahedronGeometry: resource, MeshStandardNodeMaterial: resource },
    GEO: { parks: [], recreation: [{ site: 'school', ring: [480, 400, 600, 400, 600, 520, 480, 520] }],
      campusFeatures: [{ x: 500, z: 0, plazaRadius: 50 }], landcover: { source: 'fixture' }, bounds: { minX: -2000, maxX: 6000, minZ: -2000, maxZ: 2000 } },
    toPoints(ring) { return Array.from({ length: ring.length / 2 }, (_, i) => ({ x: ring[i * 2], z: ring[i * 2 + 1] })); },
    boundsOf(poly) { return { minX: Math.min(...poly.map(p => p.x)), maxX: Math.max(...poly.map(p => p.x)),
      minZ: Math.min(...poly.map(p => p.z)), maxZ: Math.max(...poly.map(p => p.z)) }; },
    pointInPoly(poly, x, z) { const xs = poly.map(p => p.x), zs = poly.map(p => p.z); return x >= Math.min(...xs) && x <= Math.max(...xs) && z >= Math.min(...zs) && z <= Math.max(...zs); },
    SPAWN: { x: 0, z: 0 },
    terrainHeight(x, z) { return (x <= 1000 ? x * 0.2 : 200 + (x - 1000) * 2) + z * 0.1; },
    landcoverAt(x, z) { return z > 700 ? 40 : z < -700 ? 30 : 10; },
    buildingAt(x, z) { return x > 100 && x < 300 && z > 100 && z < 300; },
    waterAt(x, z) { return x < -900; },
    airfieldAt(x, z, clearance = 0) { return x >= -650 - clearance && x <= -450 + clearance && Math.abs(z) < 500 + clearance; },
    aircraftAt(x, z, clearance = 0) { return x >= 600 - clearance && x <= 800 + clearance && Math.abs(z) < 180 + clearance; },
    fuelStationAt(x, z) { return x > -350 && x < -200 && z > 300 && z < 500; },
    nearestRoads(x, z, radius) { return Math.abs(x) <= radius ? [{ dist: Math.abs(x), road: { w: 20 } }] : []; },
    createTreeField() { return treeField; } };
  const context = { window: { NYC: city }, performance, setTimeout(fn) { tasks.push(fn); return tasks.length; } };
  vm.runInNewContext(source, context);
  const vegetation = context.window.NYC.createKazanVegetation(new Group());
  function settle() {
    let count = 0;
    while (tasks.length) {
      assert.ok(count++ < 10000, 'planting work finishes');
      tasks.shift()();
    }
  }
  function visit(x, z = 0) { vegetation.update({ position: { x, y: 10, z } }); settle(); }
  settle();
  return { vegetation, treeField, visit, settle };
}

describe('Regional procedural vegetation', () => {
  test('rendered planting follows tree cover and the slope, excluding fields, roads, water and buildings', () => {
    const { vegetation, treeField } = plantingWorld();
    assert.ok(vegetation.group.children.includes(treeField.group), 'attach the tree render group');
    assert.ok(treeField.sites.length > 100, 'the tree-covered fixture produces a grove');
    for (const p of treeField.sites) {
      assert.ok(Math.abs(p.z) <= 700, 'grass and crops outside parks have no woodland planting');
      assert.ok(p.x >= -900, 'no trees in the water');
      assert.ok(Math.abs(p.x) >= 13, 'leave road width and verge clear');
      assert.ok(!(p.x > 100 && p.x < 300 && p.z > 100 && p.z < 300), 'keep building interiors clear');
      assert.ok(Math.hypot(p.x - 500, p.z) >= 56, 'keep trunks and crowns outside the monument plaza');
      assert.ok(!(p.x >= -657 && p.x <= -443 && Math.abs(p.z) < 507), 'aircraft pavement and its crown clearance override tree-cover pixels');
      assert.ok(!(p.x >= 594 && p.x <= 806 && Math.abs(p.z) < 186), 'the aircraft monument keeps trunks and crowns out of its wings and access');
      assert.ok(!(p.x > -350 && p.x < -200 && p.z > 300 && p.z < 500), 'keep the station forecourt and open canopy lanes clear');
      const courtDistance = Math.hypot(Math.max(480 - p.x, 0, p.x - 600), Math.max(400 - p.z, 0, p.z - 520));
      assert.ok(courtDistance >= 10, 'the complete tree crown clears the school field, including across a spatial cell boundary');
      assert.ok(p.x < 1020, 'exclude the steep face beyond the narrow transition at its edge');
      const ground = (p.x <= 1000 ? p.x * 0.2 : 200 + (p.x - 1000) * 2) + p.z * 0.1;
      assert.ok(Math.abs(p.y - ground) < 1e-9, 'roots use the same sloping ground');
    }
  });

  test('travel, cache eviction and interrupted planting preserve the same trees when returning', () => {
    const a = plantingWorld(), b = plantingWorld();
    const original = a.treeField.sites;
    const workingSet = a.vegetation.group.userData.planting.cachedTiles;
    for (let i = 1; i <= 10; i++) {
      a.visit(i * 4000);
      assert.ok(a.vegetation.group.userData.planting.cachedTiles <= workingSet * 3, 'cache stays within a few working sets');
    }
    a.visit(0);
    assert.deepEqual(a.treeField.sites, original, 'evicted trees regenerate at their original positions and sizes');
    b.vegetation.update({ x: 8000, z: 0 });
    b.vegetation.update({ x: 0, z: 0 });
    b.settle();
    assert.deepEqual(b.treeField.sites, original, 'a cancelled destination does not change the final planting');
  });
});
