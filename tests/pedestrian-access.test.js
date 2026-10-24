import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, test } from 'node:test';
import * as THREE from 'three/webgpu';
import { runCityModule } from './helpers/module.js';

function buildAccess(data) {
  const city = { GEO: data, THREE, nearestRailway: () => null, nearestTram: () => null, railwayAt: () => false, tramCorridorAt: () => false };
  const context = { window: { NYC: city } };
  for (const file of ['kazan-config.js', 'kazan-pedestrian-levels.js', 'kazan-ground-openings.js', 'kazan-pedestrian-structures.js', 'controllers.js']) {
    runCityModule(readFileSync(file === 'kazan-pedestrian-structures.js' && process.env.PEDESTRIAN_TEST_MODEL || new URL(`../js/${file}`, import.meta.url), 'utf8'), context);
  }
  const result = city.createKazanPedestrianStructures({
    plainMaterial: () => ({}), box() {}, flush() {}, emit(group, geometry) { geometry.dispose(); },
    shapeOf(ring) { return new THREE.Shape(city.toPoints(ring).map((p) => new THREE.Vector2(p.x, -p.z))); },
    buildingCollider(b) {
      const poly = city.toPoints(b.ring);
      return { ...city.boundsOf(poly), poly, holes: [] };
    }
  }).build(new THREE.Group());
  const controller = Object.create(city.ThirdPersonControllerManager.prototype);
  controller.activeMode = 'person'; controller.colliders = result.colliders; controller.entities = {};
  return { city, controller, result };
}

describe('Pedestrian bridge access', () => {
  test('Amirkhan stair turns and lift approaches stay open while side guards remain solid', () => {
    const data = JSON.parse(gunzipSync(readFileSync(new URL('../js/kazan-geodata.json.gz', import.meta.url))));
    data.pedestrianStructures.structures = data.pedestrianStructures.structures.filter((s) => [222924022, 222924023].includes(s.id));
    data.underground = { ...data.underground, structures: [], pavilions: [] };
    const { city, controller } = buildAccess(data);
    let samples = 0;
    for (const s of data.pedestrianStructures.structures) for (const p of s.paths) {
      for (let i = 2; i < p.pts.length; i += 2) {
        const x = p.pts[i - 2], z = p.pts[i - 1], dx = p.pts[i] - x, dz = p.pts[i + 1] - z, length = Math.hypot(dx, dz);
        if (!length) continue;
        for (const side of [-0.2, 0, 0.2]) for (let d = 0.15; d < length - 0.1; d += 0.4) {
          const px = x + dx * d / length - dz / length * p.width * side, pz = z + dz * d / length + dx / length * p.width * side;
          const y = city.pedestrianRoadHeight({ id: p.id }, px, pz) + 0.055, position = new THREE.Vector3(px, y + 1.1, pz), before = position.clone();
          controller.resolveHorizontalCollision(position, 0.28, position.y);
          assert.ok(position.distanceTo(before) < 1e-5, `${p.id}: a roof, turn rail or lift wall blocks the mapped walking lane`);
          samples++;
        }
      }
    }
    assert.ok(samples > 1000, 'exercise the actual paired crossings, stair turns and lift spur');
    const span = data.pedestrianStructures.structures[0].paths.find((p) => p.role === 'span');
    const x = (span.pts[0] + span.pts[2]) / 2, z = (span.pts[1] + span.pts[3]) / 2;
    const y = city.pedestrianRoadHeight({ id: span.id }, x, z), side = new THREE.Vector3(x, y + 1.1, z + span.width / 2), before = side.clone();
    controller.resolveHorizontalCollision(side, 0.28, side.y);
    assert.ok(side.distanceTo(before) > 0.1, 'opening the junctions must retain the actual side barrier');
  });
});

describe('Underground pedestrian access', () => {
  test('Yamasheva and Pobedy mouths descend without lids or blocking walls, including untagged metro ramps and pavilion doors', () => {
    const data = JSON.parse(gunzipSync(readFileSync(new URL('../js/kazan-geodata.json.gz', import.meta.url))));
    data.pedestrianStructures = { ...data.pedestrianStructures, structures: [] };
    data.underground = { ...data.underground, structures: data.underground.structures.filter((s) => [76127740, 169131895].includes(s.id)) };
    const { city, controller } = buildAccess(data);
    let samples = 0, descending = 0;
    const descendingSites = new Set();
    for (const site of data.underground.structures) for (const path of site.paths) {
      for (let i = 2; i < path.pts.length; i += 2) {
        const ax = path.pts[i - 2], az = path.pts[i - 1], dx = path.pts[i] - ax, dz = path.pts[i + 1] - az, length = Math.hypot(dx, dz);
        if (length < 0.1) continue;
        for (let d = 0.15; d < length - 0.1; d += 0.4) {
          const x = ax + dx * d / length, z = az + dz * d / length, y = city.pedestrianRoadHeight({ id: path.id }, x, z) + 0.055;
          assert.ok(Number.isFinite(y), 'every underground route has a usable floor');
          const actor = new THREE.Vector3(x, y + 1.1, z), before = actor.clone();
          controller.resolveHorizontalCollision(actor, 0.28, actor.y);
          assert.ok(actor.distanceTo(before) < 1e-5, `${path.id}: wall or roof blocks the actual walking route`);
          if (city.groundOpenings.contains(x, z) && y < city.groundSurfaceHeight(x, z) - 0.2) {
            assert.ok(Math.abs(city.surfaceHeight(x, z, y) - y) < 0.06, 'walking selects the descending floor through the opening');
            descending++;
            descendingSites.add(site.id);
          }
          samples++;
        }
      }
    }
    assert.ok(samples > 500 && descending > 20, 'exercise real tunnels, stairs and metro surface connections');
    assert.equal(descendingSites.size, data.underground.structures.length, 'both the Yamasheva underpass and Pobedy metro have open descending access');
    for (const pavilion of data.underground.pavilions) {
      const x = pavilion.entry.x, z = pavilion.entry.z, actor = new THREE.Vector3(x, city.groundSurfaceHeight(x, z) + 1.1, z), before = actor.clone();
      controller.resolveHorizontalCollision(actor, 0.28, actor.y);
      assert.ok(actor.distanceTo(before) < 1e-5, `${pavilion.building}: its mapped entrance stays open`);
      assert.equal(city.groundOpenings.contains(x, z), false, 'an unmapped below-ground connection does not create an invented hole');
    }
  });
});
